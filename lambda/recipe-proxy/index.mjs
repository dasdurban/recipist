/**
 * AWS Lambda fetch proxy for The Recipe App.
 *
 * The app's webview can't fetch recipe sites directly (CORS), so it routes
 * imports through a proxy. This function is that proxy: it fetches a page or
 * image server-side and hands the raw bytes back with permissive CORS headers.
 *
 * Contract (must stay stable — the app depends on it):
 *   GET /?url=<urlencoded target>        → the target's body, original content-type
 *   GET /?token=<PROXY_TOKEN>&url=<...>  → same, when PROXY_TOKEN is configured
 *
 * Both page imports (src/lib/importRecipe.ts) and recipe-photo inlining
 * (src/lib/ocr.ts) use the `?url=` form, so images must come back as real
 * binary with an `image/*` content-type.
 *
 * Configuration (Lambda environment variables, all optional):
 *   PROXY_TOKEN      shared secret; requests without ?token= get 401
 *   ALLOWED_HOSTS    comma-separated domain allowlist (e.g. "seriouseats.com,nytimes.com")
 *   MAX_BYTES        max upstream body size, default 4 MiB (Lambda caps responses at 6 MiB)
 *   FETCH_TIMEOUT_MS upstream fetch timeout, default 15000 (keep below the app's 25 s abort)
 *
 * Handler name: index.handler
 */

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

const MAX_BYTES = Number(process.env.MAX_BYTES ?? 4 * 1024 * 1024)
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 15000)
const PROXY_TOKEN = process.env.PROXY_TOKEN
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** Private / loopback / link-local IPv4 — keep the proxy from poking our network. */
function isPrivateIPv4(host) {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** Expands an IPv6 literal into 8 numeric groups, or null if unparsable. */
function ipv6Groups(host) {
  const bare = host.split('%')[0] // drop any zone id
  const halves = bare.split('::')
  if (halves.length > 2) return null
  const toParts = (part) => (part ? part.split(':') : [])
  const head = toParts(halves[0])
  const tail = halves.length === 2 ? toParts(halves[1]) : []
  if (![...head, ...tail].every((p) => /^[0-9a-f]{1,4}$/.test(p))) return null
  if (halves.length === 1 && head.length !== 8) return null
  const missing = 8 - head.length - tail.length
  if (missing < 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  return groups.length === 8 ? groups.map((g) => parseInt(g, 16)) : null
}

/** Private / loopback / link-local IPv6, including IPv4-mapped addresses. */
function isPrivateIPv6(host) {
  const g = ipv6Groups(host)
  if (!g) return true // unparsable → refuse
  const [a, , , , , f, high, low] = g
  if (g.every((x) => x === 0)) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && low === 1) return true // ::1
  if ((a & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((a & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  // ::ffff:a.b.c.d and the deprecated ::a.b.c.d IPv4 forms
  const isMapped = f === 0xffff && g.slice(0, 5).every((x) => x === 0)
  const isCompat = g.slice(0, 6).every((x) => x === 0) && (high !== 0 || low > 1)
  if (isMapped || isCompat) {
    return isPrivateIPv4([high >> 8, high & 255, low >> 8, low & 255].join('.'))
  }
  return false
}

function isPrivateHost(host) {
  if (host.includes(':')) return isPrivateIPv6(host)
  return isPrivateIPv4(host)
}

/** Returns { url } or { error }. */
function validateTarget(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return { error: 'invalid url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'only http(s) urls are supported' }
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return { error: 'host not allowed' }
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    if (isPrivateHost(host)) return { error: 'host not allowed' }
  }
  if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { error: 'host not on allowlist' }
  }
  return { url }
}

/** Text types decode as UTF-8 in-process; anything else goes back as raw bytes. */
function planBody(contentType, bytes) {
  const type = (contentType ?? 'text/html').split(';')[0].trim().toLowerCase()
  const charset = (contentType?.match(/charset=([^;]+)/i)?.[1] ?? '')
    .replace(/["']/g, '')
    .trim()
    .toLowerCase()
  const looksText =
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('xml') ||
    type.includes('javascript') ||
    type === 'application/xhtml+xml'
  const utf8 =
    !charset || charset === 'utf-8' || charset === 'utf8' || charset === 'us-ascii' || charset === 'ascii'
  if (looksText && utf8) return { binary: false, body: bytes.toString('utf8') }
  return { binary: true, body: bytes.toString('base64') }
}

export const handler = async (event = {}) => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod ?? 'GET'
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  if (method !== 'GET') return json(405, { error: 'method not allowed' })

  const query = event?.queryStringParameters ?? {}
  if (PROXY_TOKEN && query.token !== PROXY_TOKEN) return json(401, { error: 'unauthorized' })

  const target = query.url ?? query.target
  if (!target) return json(400, { error: 'missing ?url=' })

  const checked = validateTarget(target)
  if (checked.error) return json(400, { error: checked.error })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const upstream = await fetch(checked.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    })
    if (!upstream.ok) return json(upstream.status, { error: `upstream responded ${upstream.status}` })

    const bytes = Buffer.from(await upstream.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) return json(413, { error: 'response too large' })

    const contentType = upstream.headers.get('content-type') ?? 'text/html'
    const { binary, body } = planBody(contentType, bytes)
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'content-type': binary ? contentType : contentType.split(';')[0].trim(),
        'cache-control': 'public, max-age=300',
      },
      isBase64Encoded: binary,
      body,
    }
  } catch (error) {
    const aborted = error?.name === 'AbortError'
    return json(aborted ? 504 : 502, { error: aborted ? 'upstream timed out' : 'upstream fetch failed' })
  } finally {
    clearTimeout(timer)
  }
}
