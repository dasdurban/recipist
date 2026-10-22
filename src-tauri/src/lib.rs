use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

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

/// Clears a service worker out of the desktop app.
///
/// The app ships its assets inside the binary, but a build from before the
/// worker was turned off left one behind, and a worker keeps serving the
/// bundle of whichever version cached it first. The webview cannot repair
/// that on its own: updating a worker script over the asset protocol fails
/// with "An unknown error occurred when fetching the script", so the stale
/// copy is permanent - and the page that would fix it is the stale copy
/// itself. The cleanup therefore runs from here, through the browser's own
/// service worker and cache APIs, which are the same whatever bundle is on
/// screen.
///
/// The reload at the end is what actually delivers the installed build. It is
/// guarded twice over: the session marker means a second attempt is not
/// made, and the page is only reloaded once a worker is really gone.
#[cfg(desktop)]
const PURGE_SERVICE_WORKER_JS: &str = r#"
(async () => {
  const MARKER = '__recipist_service_worker_purged';
  try {
    if (!('serviceWorker' in navigator)) return;
    if (window.sessionStorage.getItem(MARKER)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    const controlled = !!navigator.serviceWorker.controller;
    if (!registrations.length && !controlled) return;
    let removed = 0;
    for (const registration of registrations) {
      try { if (await registration.unregister()) removed += 1; } catch (error) {}
    }
    if ('caches' in window) {
      for (const key of await caches.keys()) {
        try { await caches.delete(key); } catch (error) {}
      }
    }
    if (!removed && controlled) return;
    window.sessionStorage.setItem(MARKER, '1');
    location.reload();
  } catch (error) {}
})()
"#;

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

    let mut builder =
        WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target)).visible(false);
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

/// Parses a `recipist://import?url=...` deep link into the page URL to import.
///
/// Tauri checks an incoming argument against the configured schemes, but it does
/// not check the shape, so anything on the machine can call
/// `recipist://anything`. Only the one route we implement is accepted, and the
/// wrapped URL still has to be http(s), which is the same gate `fetch_text`
/// applies.
fn import_url_from_deep_link(raw: &str) -> Option<String> {
    let rest = raw.strip_prefix("recipist://")?;

    // Both `recipist://import?url=...` and `recipist:///import?url=...` are
    // produced by one browser or another, so leading slashes are trimmed rather
    // than treated as part of the route.
    let rest = rest.trim_start_matches('/');
    let (route, query) = match rest.split_once('?') {
        Some((route, query)) => (route, query),
        None => (rest, ""),
    };
    if route != "import" {
        return None;
    }

    let value = query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| *key == "url")
        .map(|(_, value)| value)?;

    let decoded = percent_decode(value);
    if decoded.starts_with("http://") || decoded.starts_with("https://") {
        Some(decoded)
    } else {
        None
    }
}

/// Decodes a percent-encoded query value. Implemented here rather than pulled in
/// as a dependency: the input is a single URL, and `+` is deliberately left
/// alone because it is valid inside a URL (unlike in a form body).
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod deep_link_tests {
    use super::{import_url_from_deep_link, percent_decode};

    #[test]
    fn accepts_the_route_a_bookmarklet_produces() {
        assert_eq!(
            import_url_from_deep_link("recipist://import?url=https%3A%2F%2Fexample.com%2Fbrownies"),
            Some("https://example.com/brownies".to_string())
        );
    }

    #[test]
    fn tolerates_the_extra_slash_browsers_add() {
        // Safari and some Linux handlers turn `recipist://import` into
        // `recipist:///import`, which must not be read as a different route.
        assert_eq!(
            import_url_from_deep_link("recipist:///import?url=https%3A%2F%2Fexample.com%2Fx"),
            Some("https://example.com/x".to_string())
        );
    }

    #[test]
    fn reads_a_url_that_is_not_encoded() {
        assert_eq!(
            import_url_from_deep_link("recipist://import?url=https://example.com/raw"),
            Some("https://example.com/raw".to_string())
        );
    }

    #[test]
    fn finds_the_url_among_other_parameters() {
        assert_eq!(
            import_url_from_deep_link("recipist://import?ref=share&url=https%3A%2F%2Fa.example%2Fb&x=1"),
            Some("https://a.example/b".to_string())
        );
    }

    #[test]
    fn rejects_other_routes() {
        // Anything else on the machine can call `recipist://`, so the route has
        // to be matched exactly rather than ignored.
        assert_eq!(import_url_from_deep_link("recipist://settings?url=https%3A%2F%2Fa.com"), None);
        assert_eq!(import_url_from_deep_link("recipist://imports?url=https%3A%2F%2Fa.com"), None);
        assert_eq!(import_url_from_deep_link("recipist://"), None);
        assert_eq!(import_url_from_deep_link("recipist://delete"), None);
    }

    #[test]
    fn rejects_schemes_that_are_not_web_pages() {
        // The wrapped URL is the same gate `fetch_text` applies, so a link can
        // never be used to read a local file or run a command.
        assert_eq!(import_url_from_deep_link("recipist://import?url=file%3A%2F%2F%2Fetc%2Fpasswd"), None);
        assert_eq!(import_url_from_deep_link("recipist://import?url=javascript%3Aalert(1)"), None);
        assert_eq!(import_url_from_deep_link("recipist://import?url=recipist%3A%2F%2Fimport"), None);
        assert_eq!(import_url_from_deep_link("recipist://import?url="), None);
    }

    #[test]
    fn rejects_a_link_with_no_url_parameter() {
        assert_eq!(import_url_from_deep_link("recipist://import"), None);
        assert_eq!(import_url_from_deep_link("recipist://import?other=1"), None);
    }

    #[test]
    fn rejects_arguments_that_are_not_links_at_all() {
        // A normal launch passes things like `--flag`, which must be ignored.
        assert_eq!(import_url_from_deep_link("--flag"), None);
        assert_eq!(import_url_from_deep_link(""), None);
        assert_eq!(import_url_from_deep_link("/usr/local/bin/recipist"), None);
    }

    #[test]
    fn survives_a_malformed_escape() {
        // A truncated or non-hex escape must not panic, and should pass through
        // rather than swallowing the rest of the string.
        assert_eq!(percent_decode("abc%"), "abc%");
        assert_eq!(percent_decode("abc%2"), "abc%2");
        assert_eq!(percent_decode("abc%zz"), "abc%zz");
        assert_eq!(percent_decode("%20"), " ");
    }

    #[test]
    fn keeps_plus_literally() {
        // In a URL `+` means plus, not space; decoding it as a space would break
        // query strings that legitimately contain one.
        assert_eq!(percent_decode("a+b"), "a+b");
    }

    #[test]
    fn handles_multibyte_characters() {
        // Recipe URLs may carry accented titles, which percent-encode as UTF-8
        // byte sequences rather than single bytes.
        assert_eq!(percent_decode("%C3%A9"), "é");
    }
}


/// The deep link the app was launched with, held until the frontend asks for it.
///
/// A cold start arrives before any window exists, so the URL cannot be emitted
/// as an event yet. The frontend calls `take_pending_import_url` once on mount
/// and the event covers every later case.
static PENDING_IMPORT_URL: OnceLock<std::sync::Mutex<Option<String>>> = OnceLock::new();

fn pending_import_url() -> &'static std::sync::Mutex<Option<String>> {
    PENDING_IMPORT_URL.get_or_init(|| std::sync::Mutex::new(None))
}

/// Hands the URL of a deep link to the frontend, bringing the window forward.
///
/// Called both when a running instance is asked to open a link and when a link
/// started the process. Emitting is harmless before the webview has loaded its
/// listener, because the cold-start case is also readable via
/// `take_pending_import_url`.
fn deliver_import_url(app: &AppHandle, url: String) {
    if let Ok(mut slot) = pending_import_url().lock() {
        *slot = Some(url.clone());
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    let _ = app.emit("deep-link://import", url);
}

/// Returns the deep link the app was launched with, and clears it.
///
/// The frontend calls this once on mount; anything later arrives as an event.
#[tauri::command]
fn take_pending_import_url() -> Option<String> {
    pending_import_url().lock().ok().and_then(|mut slot| slot.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single instance must be registered first: a second launch (which is what a
    // `recipist://` link does on Windows and Linux) forwards its arguments here
    // instead of starting a rival process with its own database.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // The deep link arrives as one of the arguments. Tauri has already
            // matched it against the configured scheme, but the route is still
            // ours to validate.
            for arg in args.iter().skip(1) {
                if let Some(url) = import_url_from_deep_link(arg) {
                    deliver_import_url(app, url);
                    break;
                }
            }
        }));
    }

    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
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
            fetch_via_webview,
            take_pending_import_url
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A link that started this process is in the command line, and the
            // plugin's own event fires too late for the frontend to have a
            // listener. Record it here so `take_pending_import_url` finds it.
            for arg in std::env::args().skip(1) {
                if let Some(url) = import_url_from_deep_link(&arg) {
                    if let Ok(mut slot) = pending_import_url().lock() {
                        *slot = Some(url);
                    }
                    break;
                }
            }

            // Links opened while the app runs come through the plugin. Its own
            // `deep-link://new-url` event is consolidated into the single event
            // the frontend listens to, so there is one path on every platform.
            {
                use tauri::Listener;
                let handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                        for raw in urls {
                            if let Some(url) = import_url_from_deep_link(&raw) {
                                deliver_import_url(&handle, url);
                                break;
                            }
                        }
                    }
                });
            }

            // On Windows and Linux the scheme is associated at install time, but
            // the association points at the packaged executable. Registering
            // again at runtime makes links work in development, and repairs the
            // pointer if an AppImage is moved. macOS resolves schemes from
            // Info.plist only, so there is nothing to re-register there.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(error) = app.deep_link().register_all() {
                    log::warn!("could not register the recipist:// scheme: {error}");
                }
            }

            Ok(())
        });

    // A service worker left behind by an older install keeps serving that
    // install's bundle, and it cannot be updated from inside the webview, so
    // it has to be cleared from out here once a page has loaded. Only the
    // app's own windows are touched: the hidden window that reads recipe
    // sites is not ours to clean up.
    #[cfg(desktop)]
    let builder = builder.on_page_load(|webview, payload| {
        use tauri::webview::PageLoadEvent;

        if payload.event() != PageLoadEvent::Finished {
            return;
        }
        if !matches!(webview.label(), "main" | "timer") {
            return;
        }
        if let Err(error) = webview.eval(PURGE_SERVICE_WORKER_JS) {
            log::warn!("could not clear the service worker: {error}");
        }
    });

    builder
        // The detached kitchen-timer window keeps the process alive, so closing
        // the main window has to end the app itself — as it did before the timer
        // had a window of its own.
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
