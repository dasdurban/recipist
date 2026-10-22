// Exports the app's database to src/assets/preseed.json.
//
// The seed is what a fresh install starts with on every platform. It has to be
// plain JSON produced by the app itself, not a copy of the browser's IndexedDB
// files: WebView2, WKWebView and Android's WebView each store those in their own
// format, so a copied folder only ever works on the machine that made it.
//
// This talks to a running copy of the app over the DevTools protocol, which has
// to be started with a debug port:
//
//   PowerShell:
//     $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
//     .\src-tauri\target\release\recipist.exe
//
//   then, in another terminal:
//     node scripts/export-preseed.mjs
//
// Re-run it whenever the seed should pick up newer content, then rebuild: the
// JSON is bundled into the frontend, so every target gets the same data.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(repoRoot, 'public', 'preseed.json')
const cdpUrl = process.env.CDP_URL ?? 'http://127.0.0.1:9222'

// Reads every object store of the app's IndexedDB with the plain IndexedDB API,
// so the script does not need the app's own modules or Dexie to be reachable
// from the page.
const EXPRESSION = `(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('recipist')
  request.onerror = () => reject(request.error)
  request.onsuccess = async () => {
    const db = request.result
    const readAll = (name) => new Promise((done, fail) => {
      if (!db.objectStoreNames.contains(name)) return done([])
      const store = db.transaction(name, 'readonly').objectStore(name)
      const all = store.getAll()
      all.onsuccess = () => done(all.result)
      all.onerror = () => fail(all.error)
    })
    try {
      const names = Array.from(db.objectStoreNames)
      const entries = await Promise.all(names.map(async (n) => [n, await readAll(n)]))
      resolve(JSON.stringify(Object.fromEntries(entries)))
    } catch (error) {
      reject(error)
    }
  }
}))()`

const targets = await fetch(`${cdpUrl}/json/list`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!page) {
  console.error('No page target found. Is the app running with --remote-debugging-port=9222?')
  process.exit(1)
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the app did not answer in time')), 30000)
  socket.addEventListener('open', () => {
    socket.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: EXPRESSION, awaitPromise: true, returnByValue: true },
      }),
    )
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== 1) return
    clearTimeout(timer)
    if (message.error) return reject(new Error(message.error.message))
    const payload = message.result?.result
    if (message.result?.exceptionDetails) {
      return reject(new Error(JSON.stringify(message.result.exceptionDetails)))
    }
    resolve(payload?.value)
  })
  socket.addEventListener('error', () => reject(new Error('could not connect to the app')))
})

socket.close()

const stored = JSON.parse(result)
const settings = stored.settings?.[0]

const backup = {
  app: 'the-recipe-app',
  version: 1,
  exportedAt: Date.now(),
  settings: settings ?? { id: 'settings' },
  categories: stored.categories ?? [],
  recipes: stored.recipes ?? [],
  shoppingLists: stored.shoppingLists ?? [],
  events: stored.events ?? [],
  eventRecipes: stored.eventRecipes ?? [],
  eventShoppingItems: stored.eventShoppingItems ?? [],
  eventIngredientChecks: stored.eventIngredientChecks ?? [],
  eventTodos: stored.eventTodos ?? [],
  recipeOrders: stored.recipeOrders ?? [],
}

if (backup.recipes.length === 0) {
  console.error('The database has no recipes, so there is nothing to seed. Is this the right app instance?')
  process.exit(1)
}

await mkdir(join(repoRoot, 'public'), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outputPath}`)
console.log(
  `  ${backup.categories.length} categories, ${backup.recipes.length} recipes, ` +
    `${backup.shoppingLists.length} shopping lists, ${backup.events.length} events`,
)
console.log('Rebuild the app to bundle this seed into every target.')
