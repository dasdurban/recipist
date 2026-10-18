import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Cloud,
  CloudUpload,
  Database,
  Download,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Server,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import clsx from 'clsx'
import type { SyncProvider, ThemeMode } from '../types'
import { useApp } from '../store/useApp'
import { Modal } from './ui/Modal'
import { Confirm } from './ui/Confirm'
import { createBackup, fileNameFor, parseBackupText } from '../lib/backup'
import { isTauri, openBackupFile, revealInFolder, saveBackupToFile } from '../lib/native'
import { getAdapter } from '../lib/sync'
import { COLOR_LABELS, COLOR_NAMES, PASTEL_COLOR_NAMES, colorFor } from '../lib/colors'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const PROVIDERS: Array<{ value: SyncProvider; label: string; icon: typeof Cloud }> = [
  { value: 'none', label: 'Off', icon: Cloud },
  { value: 'webdav', label: 'WebDAV', icon: Server },
  { value: 'owncloud', label: 'ownCloud / Nextcloud', icon: Server },
  { value: 'icloud', label: 'iCloud Drive', icon: Cloud },
  { value: 'onedrive', label: 'OneDrive', icon: Cloud },
  { value: 'googledrive', label: 'Google Drive', icon: Cloud },
  { value: 'dropbox', label: 'Dropbox', icon: Cloud },
]

type Pane = 'general' | 'appearance' | 'backup' | 'sync' | 'about'

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const importData = useApp((s) => s.importData)
  const toast = useApp((s) => s.toast)

  const [pane, setPane] = useState<Pane>('general')
  const [confirmReplace, setConfirmReplace] = useState<{ text: string; stats: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [backupPath, setBackupPath] = useState<string | null>(null)
  const [remoteFiles, setRemoteFiles] = useState<Array<{ name: string; modified?: string }>>([])

  useEffect(() => {
    if (open) setPane('general')
  }, [open])

  const adapter = getAdapter(settings.syncProvider)
  const provider = PROVIDERS.find((p) => p.value === settings.syncProvider)!

  // ------------------------------------------------------------------ actions

  async function localBackup() {
    setBusy(true)
    try {
      const backup = await createBackup(settings)
      const result = await saveBackupToFile(backup)
      if (result.status === 'cancelled') return

      if (result.status === 'saved') {
        setBackupPath(result.path)
        toast('Backup saved.', 'success')
      } else {
        toast('Backup downloaded.', 'success')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create a backup.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function pickBackupFile(file: File | undefined | null) {
    if (!file) return
    try {
      const text = await file.text()
      const { backup, stats } = await parseBackupText(text)
      setConfirmReplace({
        text: `${stats.categories} categories and ${stats.recipes} recipes. Choose whether to merge with your existing data or replace everything.`,
        stats: JSON.stringify(backup),
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not read that backup.', 'error')
    }
  }

  async function openNativeBackup() {
    try {
      const picked = await openBackupFile()
      if (!picked) return
      const { backup, stats } = await parseBackupText(picked.text)
      setConfirmReplace({
        text: `${stats.categories} categories and ${stats.recipes} recipes. Choose whether to merge with your existing data or replace everything.`,
        stats: JSON.stringify(backup),
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not read that backup.', 'error')
    }
  }

  function handleRestoreClick() {
    if (isTauri()) {
      void openNativeBackup()
      return
    }
    fileInput.current?.click()
  }

  async function testConnection() {
    if (!adapter) return
    setBusy(true)
    try {
      const message = await adapter.test(settings)
      await updateSettings({ lastSyncAt: Date.now() })
      toast(message, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Connection failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function uploadBackup() {
    if (!adapter) return
    setBusy(true)
    try {
      const backup = await createBackup(settings)
      const json = JSON.stringify(backup)
      await adapter.upload(settings, fileNameFor(), json)
      await adapter.upload(settings, 'recipe-app-latest.json', json)
      await updateSettings({ lastSyncAt: Date.now() })
      toast('Uploaded to the cloud.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Upload failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function listRemote() {
    if (!adapter) return
    setBusy(true)
    try {
      const files = await adapter.list(settings)
      setRemoteFiles(files.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? '')))
      if (!files.length) toast('No backups found in that folder.', 'info')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not list the remote folder.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function restoreRemote(name: string) {
    if (!adapter) return
    setBusy(true)
    try {
      const text = await adapter.download(settings, name)
      const { backup, stats } = parseBackupText(text)
      setConfirmReplace({
        text: `Restore "${name}" — ${stats.categories} categories and ${stats.recipes} recipes.`,
        stats: JSON.stringify(backup),
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Download failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const panes: Array<{ id: Pane; label: string; icon: typeof Sun }> = [
    { id: 'general', label: 'General', icon: Server },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'backup', label: 'Backup', icon: Database },
    { id: 'sync', label: 'Cloud & Sync', icon: Cloud },
    { id: 'about', label: 'About', icon: Monitor },
  ]

  return (
    <>
      <Modal open={open} onClose={onClose} title="Settings" size="xl">
        <div className="flex flex-col sm:flex-row gap-4 min-h-[26rem]">
          <nav className="sm:w-48 shrink-0 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0">
            {panes.map((p) => (
              <button
                key={p.id}
                onClick={() => setPane(p.id)}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                  pane === p.id ? 'bg-surface-3 font-semibold' : 'hover:bg-surface-2 text-content-muted',
                )}
              >
                <p.icon size={16} />
                {p.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 space-y-6">
            {pane === 'general' && (
              <>
                <Section title="Recipe import" subtitle="How The Recipe App fetches pages from the web">
                  <Field label="CORS proxy">
                    <input
                      value={settings.importProxy}
                      onChange={(e) => updateSettings({ importProxy: e.target.value })}
                      placeholder="https://api.allorigins.win/raw?url="
                      className="w-full"
                    />
                  </Field>
                  <p className="text-xs text-content-muted mt-1.5 leading-relaxed">
                    On the desktop app imports are fetched directly, with no proxy needed, and pages that
                    only render in a browser are loaded in the background. This proxy is the fallback (and is
                    required in the web build, where browsers block direct page requests). Leave the default,
                    or point it at your own server.
                  </p>
                </Section>

                <Section title="Default category color" subtitle="Used for new categories you create">
                  <div className="space-y-2">
                    {(['vivid', 'pastel'] as const).map((set) => (
                      <div key={set} className="flex items-center gap-3">
                        <button
                          onClick={() => updateSettings({ defaultColorSet: set })}
                          className={clsx(
                            'w-20 text-xs font-semibold uppercase tracking-wide text-left',
                            settings.defaultColorSet === set ? 'text-content' : 'text-content-muted',
                          )}
                        >
                          {set === 'vivid' ? 'Bright' : 'Pastel'}
                        </button>
                        <div className="flex flex-wrap gap-1.5">
                          {(set === 'vivid' ? COLOR_NAMES : PASTEL_COLOR_NAMES).map((name) => (
                            <span
                              key={name}
                              title={COLOR_LABELS[name]}
                              className="h-6 w-6 rounded-md"
                              style={{ backgroundColor: colorFor(name, set) }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {pane === 'appearance' && (
              <Section title="Theme" subtitle="Light, dark, or follow your device">
                <div className="grid grid-cols-3 gap-2">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSettings({ theme: opt.value })}
                      className={clsx(
                        'rounded-xl border p-3 flex flex-col items-center gap-2 transition-colors',
                        settings.theme === opt.value
                          ? 'border-brand bg-brand/5 text-content'
                          : 'border-line text-content-muted hover:bg-surface-2',
                      )}
                    >
                      <opt.icon size={20} />
                      <span className="text-sm font-medium">{opt.label}</span>
                      {settings.theme === opt.value && <Check size={14} className="text-brand" />}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {pane === 'backup' && (
              <Section title="Local backup" subtitle="Save everything to a file, or restore from one">
                <div className="grid sm:grid-cols-2 gap-3">
                  <button className="btn-soft py-6 flex-col !gap-2" onClick={localBackup} disabled={busy}>
                    <HardDriveDownload size={20} />
                    Back up to a file
                  </button>
                  <button
                    className="btn-soft py-6 flex-col !gap-2"
                    onClick={handleRestoreClick}
                    disabled={busy}
                  >
                    <Upload size={20} />
                    Restore from a file
                  </button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => pickBackupFile(e.target.files?.[0])}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {backupPath && isTauri() && (
                    <button
                      className="btn-soft px-3 py-2 text-sm"
                      onClick={async () => {
                        try {
                          await revealInFolder(backupPath)
                        } catch (error) {
                          toast(error instanceof Error ? error.message : 'Could not reveal that file.', 'error')
                        }
                      }}
                      disabled={busy}
                    >
                      <FolderOpen size={16} className="mr-1.5" /> Show in Finder
                    </button>
                  )}
                </div>
              </Section>
            )}

            {pane === 'sync' && (
              <>
                <Section title="Cloud backup &amp; sync" subtitle="Pick where The Recipe App keeps an off-device copy">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => updateSettings({ syncProvider: p.value })}
                        className={clsx(
                          'rounded-xl border px-3 py-3 flex flex-col items-center gap-1.5 text-sm transition-colors',
                          settings.syncProvider === p.value
                            ? 'border-brand bg-brand/5 font-medium'
                            : 'border-line text-content-muted hover:bg-surface-2',
                        )}
                      >
                        <p.icon size={18} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Section>

                {(settings.syncProvider === 'webdav' || settings.syncProvider === 'owncloud') && (
                  <Section title={`${provider.label} connection`} subtitle="Works with Nextcloud, ownCloud and most WebDAV servers">
                    <Field label="Server URL">
                      <input
                        value={settings.webdav.url}
                        onChange={(e) =>
                          updateSettings({ webdav: { ...settings.webdav, url: e.target.value } })
                        }
                        placeholder="https://cloud.example.com/remote.php/dav/files/me"
                        className="w-full"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <Field label="Username">
                        <input
                          value={settings.webdav.username}
                          onChange={(e) =>
                            updateSettings({ webdav: { ...settings.webdav, username: e.target.value } })
                          }
                          className="w-full"
                          autoComplete="username"
                        />
                      </Field>
                      <Field label="Password / app password">
                        <input
                          type="password"
                          value={settings.webdav.password}
                          onChange={(e) =>
                            updateSettings({ webdav: { ...settings.webdav, password: e.target.value } })
                          }
                          className="w-full"
                          autoComplete="current-password"
                        />
                      </Field>
                    </div>
                    <Field label="Remote folder" className="mt-3">
                      <input
                        value={settings.webdav.directory}
                        onChange={(e) =>
                          updateSettings({ webdav: { ...settings.webdav, directory: e.target.value } })
                        }
                        placeholder="/the-recipe-app"
                        className="w-full"
                      />
                    </Field>

                    <div className="flex flex-wrap gap-2 mt-4">
                      <button className="btn-soft" onClick={testConnection} disabled={busy}>
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        Test
                      </button>
                      <button className="btn-primary" onClick={uploadBackup} disabled={busy}>
                        <CloudUpload size={15} /> Back up now
                      </button>
                      <button className="btn-soft" onClick={listRemote} disabled={busy}>
                        <Download size={15} /> List remote
                      </button>
                    </div>

                    {remoteFiles.length > 0 && (
                      <ul className="mt-3 divide-y divide-line border border-line rounded-xl overflow-hidden">
                        {remoteFiles.map((f) => (
                          <li key={f.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <Cloud size={14} className="text-content-muted shrink-0" />
                            <span className="flex-1 min-w-0 truncate">{f.name}</span>
                            <span className="text-xs text-content-muted hidden sm:block">
                              {f.modified ? new Date(f.modified).toLocaleString() : ''}
                            </span>
                            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => restoreRemote(f.name)}>
                              Restore
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                )}

                {adapter && settings.syncProvider !== 'webdav' && settings.syncProvider !== 'owncloud' && (
                  <Section title={`${provider.label} setup`} subtitle="Cloud SDK sign-in needs a registered app">
                    <p className="text-sm text-content-muted leading-relaxed">{adapter.setupHint}</p>
                    <Field label="Client ID / app key" className="mt-3">
                      <input
                        value={settings.oauth?.[settings.syncProvider as 'dropbox']?.clientId ?? ''}
                        onChange={(e) =>
                          updateSettings({
                            oauth: {
                              ...settings.oauth,
                              [settings.syncProvider]: {
                                ...settings.oauth?.[settings.syncProvider as 'dropbox'],
                                clientId: e.target.value,
                              },
                            },
                          })
                        }
                        placeholder="Paste your client ID"
                        className="w-full"
                      />
                    </Field>
                    <p className="text-xs text-content-muted mt-2 leading-relaxed">
                      Once a client ID is saved, this provider's sign-in flow is wired to use it.
                      Until then, use WebDAV or a local file backup.
                    </p>
                  </Section>
                )}

                <Section title="Automatic sync">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoSync}
                      onChange={(e) => updateSettings({ autoSync: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">
                      Back up automatically when recipes change
                      {settings.lastSyncAt && (
                        <span className="block text-xs text-content-muted">
                          Last successful sync {new Date(settings.lastSyncAt).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </label>
                </Section>
              </>
            )}

            {pane === 'about' && (
              <Section title="About The Recipe App" subtitle="Version 0.1.0">
                <p className="text-sm text-content-muted leading-relaxed">
                  The Recipe App keeps all of your recipes on your device first. Import from a link or a
                  photo, estimate calories and health, and back up to the cloud on your terms. It runs
                  as an installable web app and packages natively for iOS, iPadOS, Android, macOS,
                  Linux and Windows.
                </p>
                <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-1">
                    <Trash2 size={14} /> Danger zone
                  </div>
                  <p className="text-xs text-content-muted mb-3">
                    Remove every category and recipe from this device.
                  </p>
                  <button
                    className="btn-danger !py-1.5 text-sm"
                    onClick={() =>
                      setConfirmReplace({ text: 'Delete ALL local data? This cannot be undone.', stats: '' })
                    }
                  >
                    Clear all data
                  </button>
                </div>
              </Section>
            )}
          </div>
        </div>
      </Modal>

      <Confirm
        open={Boolean(confirmReplace)}
        title={confirmReplace?.stats ? 'Restore this backup?' : 'Clear all data?'}
        message={confirmReplace?.text ?? ''}
        confirmLabel={confirmReplace?.stats ? 'Restore' : 'Delete everything'}
        destructive
        onClose={() => setConfirmReplace(null)}
        onConfirm={async () => {
          const payload = confirmReplace
          setConfirmReplace(null)
          if (!payload) return
          if (!payload.stats) {
            await importData({ categories: [], recipes: [], settings: undefined }, 'replace')
            toast('All data cleared.', 'success')
            return
          }
          const { backup } = parseBackupText(payload.stats)
          await importData(
            {
              categories: backup.categories,
              recipes: backup.recipes,
              shoppingLists: backup.shoppingLists,
              settings: backup.settings,
              events: backup.events,
              eventRecipes: backup.eventRecipes,
              eventShoppingItems: backup.eventShoppingItems,
              eventIngredientChecks: backup.eventIngredientChecks,
              eventTodos: backup.eventTodos,
            },
            'replace',
          )
          toast('Backup restored.', 'success')
        }}
      />
    </>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-content-muted mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </section>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}
