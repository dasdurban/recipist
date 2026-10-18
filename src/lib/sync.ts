import type { Settings, WebDavConfig } from '../types'

export interface RemoteFile {
  name: string
  modified?: string
  size?: number
}

export interface StorageAdapter {
  id: string
  label: string
  /** true when the adapter has everything it needs to run */
  isConfigured(settings: Settings): boolean
  /** hint shown in the settings panel when not configured */
  setupHint: string
  test(settings: Settings): Promise<string>
  upload(settings: Settings, name: string, contents: string): Promise<void>
  download(settings: Settings, name: string): Promise<string>
  list(settings: Settings): Promise<RemoteFile[]>
  remove(settings: Settings, name: string): Promise<void>
}

function normalizeDir(dir: string): string {
  const trimmed = (dir || '').trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : ''
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

async function davFetch(config: WebDavConfig, url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  if (config.username || config.password) {
    headers.set('Authorization', `Basic ${btoa(`${config.username}:${config.password}`)}`)
  }
  return fetch(url, { ...init, headers })
}

export const webdavAdapter: StorageAdapter = {
  id: 'webdav',
  label: 'WebDAV',
  isConfigured: (s) => Boolean(s.webdav.url),
  setupHint: 'Enter your WebDAV server URL and credentials (works for Nextcloud, ownCloud, Box, etc.).',
  async test(settings) {
    const dir = normalizeDir(settings.webdav.directory)
    const res = await davFetch(settings.webdav, joinUrl(settings.webdav.url, dir), {
      method: 'PROPFIND',
      headers: { Depth: '0' },
    })
    if (res.status === 401) throw new Error('WebDAV rejected the username or password.')
    if (res.status === 404 && dir) {
      // folder does not exist yet; create it
      const created = await davFetch(settings.webdav, joinUrl(settings.webdav.url, dir), {
        method: 'MKCOL',
      })
      if (!created.ok && created.status !== 405) {
        throw new Error(`Could not create the remote folder (HTTP ${created.status}).`)
      }
      return 'Connected. Created the remote folder.'
    }
    if (!res.ok && res.status !== 207) {
      throw new Error(`WebDAV responded with HTTP ${res.status}.`)
    }
    return 'Connected to WebDAV.'
  },
  async upload(settings, name, contents) {
    const dir = normalizeDir(settings.webdav.directory)
    statedir(settings, dir)
    const res = await davFetch(settings.webdav, joinUrl(settings.webdav.url, `${dir}/${name}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: contents,
    })
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`)
  },
  async download(settings, name) {
    const dir = normalizeDir(settings.webdav.directory)
    const res = await davFetch(settings.webdav, joinUrl(settings.webdav.url, `${dir}/${name}`), {
      method: 'GET',
    })
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`)
    return res.text()
  },
  async list(settings) {
    const dir = normalizeDir(settings.webdav.directory)
    const res = await davFetch(settings.webdav, joinUrl(settings.webdav.url, dir), {
      method: 'PROPFIND',
      headers: { Depth: '1' },
    })
    if (!res.ok && res.status !== 207) throw new Error(`Listing failed (HTTP ${res.status}).`)
    const xml = await res.text()
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const responses = Array.from(doc.getElementsByTagName('*')).filter(
      (el) => el.localName === 'response',
    )
    const files: RemoteFile[] = []
    for (const node of responses) {
      const children = Array.from(node.getElementsByTagName('*'))
      const href = children.find((c) => c.localName === 'href')?.textContent?.trim() ?? ''
      const modified = children.find((c) => c.localName === 'getlastmodified')?.textContent?.trim()
      const length = children.find((c) => c.localName === 'getcontentlength')?.textContent?.trim()
      const name = decodeURIComponent(href.split('/').filter(Boolean).pop() ?? '')
      if (name && name.endsWith('.json')) {
        files.push({ name, modified, size: length ? Number(length) : undefined })
      }
    }
    return files
  },
  async remove(settings, name) {
    const dir = normalizeDir(settings.webdav.directory)
    const res = await davFetch(settings.webdav, joinUrl(settings.webdav.url, `${dir}/${name}`), {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 404) throw new Error(`Delete failed (HTTP ${res.status}).`)
  },
}

function statedir(settings: Settings, dir: string) {
  // Best-effort: ensure the folder exists before a PUT (ignore failures).
  void davFetch(settings.webdav, joinUrl(settings.webdav.url, dir), { method: 'MKCOL' }).catch(
    () => undefined,
  )
}

/**
 * OAuth-based providers (iCloud, OneDrive, Google Drive, Dropbox).
 * Cloud SDKs need a registered app + client id. Until those are filled in we
 * surface a helpful, non-destructive adapter that explains what's required.
 */
function oauthStub(
  id: 'icloud' | 'onedrive' | 'googledrive' | 'dropbox',
  label: string,
  instructions: string,
): StorageAdapter {
  const notReady = (): never => {
    throw new Error(`${label} is not connected yet. ${instructions}`)
  }
  return {
    id,
    label,
    isConfigured: (s) => Boolean(s.oauth?.[id]?.clientId),
    setupHint: instructions,
    test: () => notReady(),
    upload: () => notReady(),
    download: () => notReady(),
    list: () => notReady(),
    remove: () => notReady(),
  }
}

export const icloudAdapter = oauthStub(
  'icloud',
  'iCloud Drive',
  'Requires the CloudKit/iCloud container set up in Xcode and an Apple developer account.',
)

export const oneDriveAdapter = oauthStub(
  'onedrive',
  'OneDrive',
  'Register an app in the Azure portal, then paste its client ID below.',
)

export const googleDriveAdapter = oauthStub(
  'googledrive',
  'Google Drive',
  'Create OAuth credentials in the Google Cloud console, then paste the client ID below.',
)

export const dropboxAdapter = oauthStub(
  'dropbox',
  'Dropbox',
  'Create a scoped app in the Dropbox App Console, then paste its app key below.',
)

export const owncloudAdapter: StorageAdapter = {
  ...webdavAdapter,
  id: 'owncloud',
  label: 'ownCloud / Nextcloud',
  setupHint: 'Point the WebDAV URL at your ownCloud/Nextcloud remote.php/dav/files/<user>/ path.',
}

const ADAPTERS: Record<string, StorageAdapter> = {
  webdav: webdavAdapter,
  owncloud: owncloudAdapter,
  icloud: icloudAdapter,
  onedrive: oneDriveAdapter,
  googledrive: googleDriveAdapter,
  dropbox: dropboxAdapter,
}

export function getAdapter(provider: string): StorageAdapter | null {
  return ADAPTERS[provider] ?? null
}
