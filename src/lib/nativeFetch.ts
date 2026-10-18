/**
 * Native (Tauri) HTTP fetching.
 *
 * In the desktop/mobile shell the Rust side can fetch URLs directly: no CORS,
 * no proxy, and the user's own IP — which is why it succeeds on recipe sites
 * that block datacenter proxies. In a plain browser build these helpers return
 * `undefined` and callers fall back to the CORS-proxy path.
 */
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './native'

/** 6 MB, matching the web path's cap on inlined photos. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

/** True when the native fetch commands are available. */
export function hasNativeFetch(): boolean {
  return isTauri()
}

/** Fetches a web page from the native shell. */
export async function nativeFetchText(url: string): Promise<string | undefined> {
  if (!hasNativeFetch()) return undefined
  try {
    const html = await invoke<string>('fetch_text', { url })
    return html && html.length >= 200 ? html : undefined
  } catch {
    return undefined
  }
}

export interface NativeBinary {
  contentType: string
  dataUrl: string
  bytes: number
}

/**
 * Fetches a page through the app's own webview engine (WKWebView/WebView2).
 *
 * This is a real browser, so it gets past sites that reject every plain HTTP
 * client by fingerprint (they answer 402/403 to curl, Node and `fetch_text`
 * alike). Much slower than `nativeFetchText`, so try that one first.
 */
export async function nativeFetchViaWebview(url: string, blockAds = true): Promise<string | undefined> {
  if (!hasNativeFetch()) return undefined
  try {
    const html = await invoke<string>('fetch_via_webview', { url, blockAds })
    return html && html.length >= 200 ? html : undefined
  } catch {
    return undefined
  }
}

/** Fetches a photo from the native shell, already inlined as a data URL. */
export async function nativeFetchBinary(url: string): Promise<NativeBinary | undefined> {
  if (!hasNativeFetch()) return undefined
  try {
    const result = await invoke<NativeBinary>('fetch_binary', { url })
    if (!result?.dataUrl || !result.contentType?.startsWith('image/')) return undefined
    if (result.bytes > MAX_IMAGE_BYTES) return undefined
    return result
  } catch {
    return undefined
  }
}
