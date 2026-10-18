use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Recipe sites routinely 403 non-browser user agents, so look like Chrome.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// Hard ceiling on a single response body.
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// How long the hidden webview gets to finish loading a page.
const WEBVIEW_LOAD_TIMEOUT: Duration = Duration::from_secs(25);

/// Grace period after the page is usable, for client-side rendering to fill in
/// the markup.
const WEBVIEW_SETTLE: Duration = Duration::from_millis(400);

/// True as soon as the DOM is usable and a recipe is described in the markup.
/// Waiting for the `load` event instead would also wait on images, ads and
/// video, which we never look at.
const PAGE_READY_JS: &str = "document.readyState === 'complete' || (document.readyState !== 'loading' && Array.prototype.some.call(document.querySelectorAll('script[type=application/ld+json]'), function (s) { return (s.textContent || '').indexOf('Recipe') !== -1 }))";

/// Injected into the hidden fetcher window before any page script runs. Recipe
/// sites spend most of their load time on advertising, analytics and video that
/// we can never use, so it never starts.
const PAGE_SCRIPT: &str = r#"
(() => {
  const BLOCKED = /(doubleclick|googlesyndication|googleadservices|googletagservices|googletagmanager|google-analytics|analytics\.google|adnxs|amazon-adsystem|criteo|taboola|outbrain|pubmatic|rubiconproject|casalemedia|33across|sharethrough|scorecardresearch|quantserve|chartbeat|parsely|hotjar|newrelic|nr-data|segment\.io|mixpanel|optimizely|moatads|adsafeprotected|imasdk|jwplayer|spotx|smartadserver|teads|yieldmo)/i;

  const urlOf = (input) => {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input.url === 'string') return input.url;
    } catch (error) {}
    return '';
  };
  const isBlocked = (value) => BLOCKED.test(urlOf(value));

  // 1. Ad, tracker and video requests never leave the page.
  const realFetch = window.fetch;
  if (realFetch) {
    window.fetch = function (input) {
      if (isBlocked(input)) return Promise.resolve(new Response(null, { status: 204 }));
      return realFetch.apply(this, arguments);
    };
  }
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isBlocked(url)) {
      this.__skipped = true;
      return;
    }
    return xhrOpen.apply(this, arguments);
  };
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__skipped) return;
    return xhrSend.apply(this, arguments);
  };
  if (navigator.sendBeacon) navigator.sendBeacon = () => false;

  // 2. Nothing autoplays.
  if (window.HTMLMediaElement) {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    try {
      Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', {
        configurable: true,
        get: () => false,
        set: () => {},
      });
    } catch (error) {}
  }

  // 3. Media and ad frames are refused even as the parser inserts them.
  const ALWAYS_DROP = ['IFRAME', 'VIDEO', 'AUDIO', 'SOURCE', 'EMBED', 'OBJECT'];
  const dropNode = (node) => {
    if (!node || node.nodeType !== 1) return false;
    if (ALWAYS_DROP.indexOf(node.tagName) !== -1) return true;
    if (node.tagName === 'SCRIPT' || node.tagName === 'LINK' || node.tagName === 'IMG') {
      return isBlocked(node.getAttribute('src') || node.getAttribute('href') || '');
    }
    return false;
  };
  const dropInside = (root) => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('iframe,video,audio,embed,object').forEach((node) => node.remove());
  };

  const appendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function (node) {
    if (dropNode(node)) return node;
    return appendChild.call(this, node);
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, reference) {
    if (dropNode(node)) return node;
    return insertBefore.call(this, node, reference);
  };
  const innerHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (innerHtml && innerHtml.set) {
    const setInnerHtml = innerHtml.set;
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get: innerHtml.get,
      set(value) {
        if (typeof value === 'string' && /<(iframe|video|audio|object|embed)\b/i.test(value)) {
          value = value
            .replace(/<(iframe|video|audio|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(/<\/?(iframe|video|audio|object|embed)\b[^>]*>/gi, '');
        }
        return setInnerHtml.call(this, value);
      },
    });
  }

  // 4. Sweep whatever the parser already got through.
  const sweep = () => {
    dropInside(document);
    document.querySelectorAll('script[src],img[src],link[href]').forEach((node) => {
      const url = node.getAttribute('src') || node.getAttribute('href') || '';
      if (isBlocked(url)) node.remove();
    });
  };
  document.addEventListener('DOMContentLoaded', sweep);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (dropNode(node)) node.remove();
        else if (node.nodeType === 1) dropInside(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
})();
"#;

/// Shared client so connections are reused between imports.
fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(25))
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent(USER_AGENT)
            .build()
            .expect("failed to build the HTTP client")
    })
}

fn check_url(url: &str) -> Result<(), String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        Ok(())
    } else {
        Err("only http(s) urls are supported".into())
    }
}

fn header_content_type(response: &reqwest::Response) -> String {
    response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .trim()
        .to_string()
}

/// Fetches a web page with a plain HTTP client: no CORS, no proxy. Fast, and
/// enough for most sites; sites with bot fingerprinting need `fetch_via_webview`.
#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    check_url(&url)?;
    let response = http().get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    if let Some(len) = response.content_length() {
        if len as usize > MAX_BYTES {
            return Err("response too large".into());
        }
    }
    // Decodes using the charset in the Content-Type header, defaulting to UTF-8.
    response
        .text_with_charset("utf-8")
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchedBinary {
    content_type: String,
    data_url: String,
    bytes: usize,
}

/// Fetches a photo (or any binary) and returns it as a data URL, so the frontend
/// can inline it for offline use without a proxy.
#[tauri::command]
async fn fetch_binary(url: String) -> Result<FetchedBinary, String> {
    check_url(&url)?;
    let response = http().get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    if let Some(len) = response.content_length() {
        if len as usize > MAX_BYTES {
            return Err("response too large".into());
        }
    }

    let content_type = header_content_type(&response);
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("response too large".into());
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(FetchedBinary {
        data_url: format!("data:{content_type};base64,{encoded}"),
        content_type,
        bytes: bytes.len(),
    })
}

fn next_fetch_id() -> u128 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_micros())
        .unwrap_or(0);
    let tick = COUNTER.fetch_add(1, Ordering::Relaxed) as u128;
    micros * 1000 + (tick % 1000)
}

/// Runs a JS expression in `window` and returns its value as a string.
///
/// Uses `eval_with_callback` rather than the IPC so it works in a webview that
/// is displaying a remote page, which has no access to Tauri's IPC.
fn eval_string(window: &WebviewWindow, js: &str, timeout: Duration) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    window
        .eval_with_callback(js.to_string(), move |json| {
            let _ = tx.send(json);
        })
        .map_err(|e| e.to_string())?;

    let raw = rx
        .recv_timeout(timeout)
        .map_err(|_| "the page did not respond".to_string())?;

    // The value arrives JSON-encoded; unescape strings, pass anything else through.
    match serde_json::from_str::<String>(&raw) {
        Ok(value) => Ok(value),
        Err(_) => Ok(raw),
    }
}

/// Waits until the page is usable, then returns its HTML.
fn read_loaded_document(window: &WebviewWindow) -> Result<String, String> {
    let deadline = Instant::now() + WEBVIEW_LOAD_TIMEOUT;
    loop {
        if Instant::now() >= deadline {
            return Err("timed out waiting for the page to load".into());
        }
        match eval_string(window, PAGE_READY_JS, Duration::from_millis(1500)) {
            Ok(value) if value == "true" => break,
            _ => std::thread::sleep(Duration::from_millis(200)),
        }
    }

    std::thread::sleep(WEBVIEW_SETTLE);

    let html = eval_string(
        window,
        "document.documentElement.outerHTML",
        Duration::from_secs(10),
    )?;

    if html.len() < 200 {
        return Err("the page came back empty".into());
    }
    Ok(html)
}

/// Opens the page in a hidden window of the app's own webview engine (WKWebView)
/// and returns the rendered HTML.
///
/// Sites protected by bot fingerprinting reject every plain HTTP client — curl,
/// Node, Python and `fetch_text` all get blocked while the same URL loads fine in
/// a browser. Going through the real engine is what makes those imports work.
fn fetch_page_in_webview(app: AppHandle, url: String, block_ads: bool) -> Result<String, String> {
    check_url(&url)?;
    let target = url.parse().map_err(|_| "invalid url".to_string())?;
    let label = format!("page-fetcher-{}", next_fetch_id());

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target))
        .visible(false);
    if block_ads {
        builder = builder.initialization_script_for_all_frames(PAGE_SCRIPT);
    }

    let window = builder
        .build()
        .map_err(|e| format!("could not open a background page: {e}"))?;

    let result = read_loaded_document(&window);
    let _ = window.close();
    result
}

/// Fetches a page through the app's webview engine, for sites that block plain
/// HTTP clients. Slower than `fetch_text`, so the frontend tries that first.
///
/// `block_ads: false` loads the page exactly as the site intended, for the rare
/// page whose recipe only appears in a frame or an ad-delivered script.
#[tauri::command]
async fn fetch_via_webview(
    app: AppHandle,
    url: String,
    block_ads: Option<bool>,
) -> Result<String, String> {
    let block_ads = block_ads.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || fetch_page_in_webview(app, url, block_ads))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native shell plugins. The webview can't open a new window (no
        // `new_window_req_handler` is registered, so wry denies it) and its
        // downloads aren't wired up without an `on_download` hook — these three
        // give the frontend the system browser, real file dialogs and file IO.
        // `fs` comes first so its scope is in place for the dialogs.
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_text,
            fetch_binary,
            fetch_via_webview
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
