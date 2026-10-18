# The Recipe App

A recipe collection app that keeps your recipes **on your device first**. Add them by
hand, snag them from a website, or scan a photo — then see a calorie estimate and a
simple health score at a glance.

One codebase ships as an installable **PWA** and packages natively for
**iOS, iPadOS, Android, macOS, Linux and Windows**.

---

## Features

- **Category-first navigation.** A left nav pane lists your categories
  (Appetizers, Breakfast, Lunch, Dinner, Dessert, plus any you create). Each category
  is a top level that holds all of its recipes; tapping a recipe opens it.
- **Color-coded categories.** Two coordinated palettes, each with 8 colors:
  - **Bright:** black, blue, pink, green, yellow, red, orange, turquoise
  - **Pastel:** grey, blue, pink, green, yellow, red, orange, turquoise

  Category colors tint the category header, recipe cards, ingredient numbers and
  nutrition accents throughout the app.
- **Header** with the nav-tree toggle, a back button, and a settings gear.
- **Recipe page** laid out exactly as asked: photo of the finished dish at the top,
  the ingredients list below it, then the numbered instructions. Includes a servings
  scaler (quantities recalculate, e.g. `1 1/2 cups` → `3/4 cup`), tick-off checkboxes,
  favorite, print, tags, notes and a source link.
- **Add recipes three ways**
  1. **Manual** — a full editor with dynamic ingredient rows and steps.
  2. **From a link** — reads the `schema.org/Recipe` JSON-LD most food sites publish.
  3. **From a photo** — on-device OCR (Tesseract.js) reads a recipe card, cookbook
     page or screenshot. Nothing is uploaded.
- **Calories + health score.** A bundled nutrition database (~130 common ingredients)
  parses quantities, units and package sizes, totals the macros, and produces a 0–100
  health score (Very healthy / Healthy / Okay / Indulgent) from fiber and protein
  density versus added sugar, sodium, fat and processed ingredients.
- **Backup & sync.** One-file local backup/restore, plus real **WebDAV** sync that
  works with Nextcloud/ownCloud, and prepared slots for iCloud, OneDrive,
  Google Drive and Dropbox.
- **Light / dark / system theme**, chosen in Settings.
- **Offline-first.** Everything lives in IndexedDB; the service worker caches the app
  so it launches with no connection.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 18 + TypeScript + Tailwind CSS |
| Build | Vite 5 |
| PWA | `vite-plugin-pwa` (Workbox) |
| Local data | IndexedDB via Dexie |
| State | Zustand |
| Icons | lucide-react |
| OCR | tesseract.js (lazy-loaded) |
| iOS / iPadOS / Android | Capacitor 6 |
| macOS / Linux / Windows | Tauri 2 |

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build
```

### Refreshing app icons

The tomato logo is rendered from code — no design tool needed. `gen-icons.mjs`
ray-casts a squashed sphere with a warm key light, cool fill, speculars, a
subsurface rim glow, skin ribbing/noise, a six-sepal calyx, a stem, a contact
shadow and calyx ambient occlusion, then writes the PNGs with a hand-rolled
encoder (no image dependencies):

```bash
npm run icons        # public/icons/*.png + apple-touch-icon.png
```

The in-app logo (`src/components/TomatoLogo.tsx`) and `public/favicon.svg` are
the same design as vector art, so they stay crisp at any size.

The Tauri icon set is derived from the same artwork:

```bash
npx tauri icon public/icons/icon-1024.png
```

### Install as a PWA

Open the deployed site, then use the browser's **Install / Add to Home Screen**
action. On desktop Chrome/Edge an install button appears in the address bar; on
iOS use Share → *Add to Home Screen*.

---

## Packaging the native apps

The web build in `dist/` is the single source of truth for every platform.

### iOS & iPadOS (Capacitor)

```bash
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios        # Xcode
```

In Xcode set your team/bundle id, then run on a device or archive for the App Store.
iPadOS uses the same target.

Optional native camera access: `npm i @capacitor/camera` is already a dependency;
the photo picker falls back to the system file picker, which works everywhere.

### Android (Capacitor)

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android    # Android Studio
```

Convenience scripts: `npm run cap:ios`, `npm run cap:android`.

### macOS, Linux & Windows (Tauri)

Rust is required (`cargo`). The `src-tauri/` project is already configured.

```bash
npm run tauri:dev        # hot-reloading desktop window
npm run tauri:build      # installers in src-tauri/target/release/bundle
```

Tauri produces `.dmg`/`.app` (macOS), `.AppImage`/`.deb` (Linux) and `.msi`/`.exe`
(Windows) from the same bundle.

---

## Recipe import & the CORS proxy

Browsers won't let a web page fetch an arbitrary site, so imports are routed through
a CORS proxy. The Recipe App ships with a chain of public proxies and falls back through
them automatically:

```
api.allorigins.win → api.codetabs.com → corsproxy.io → api.cors.lol → direct
```

Public proxies are rate-limited and occasionally down. For dependable importing you
can point The Recipe App at your own using the **CORS proxy** field in
*Settings → General*. Two forms are supported:

```
https://your-proxy.example.com/?url=            # target is appended, URL-encoded
https://your-proxy.example.com/fetch?target={url}   # {url} is substituted
```

A ~15-line serverless function is enough; it just fetches the target and returns the
body with `Access-Control-Allow-Origin: *`.

Import works best with a link straight to a recipe page. Parsing order is
JSON-LD → microdata → common class names, so most major food sites work.

---

## How the nutrition estimate works

- A bundled table of foods with per-100 g values, plus grams-per-cup and grams-per-piece
  so `1 1/2 cups flour`, `2 tbsp olive oil`, `300 ml milk`, `3 cloves garlic` and
  `1 (14.5 oz) can tomatoes` all resolve to sensible weights.
- Ingredients written without a quantity (`salt and pepper to taste`, `oil for frying`)
  get a small sensible default rather than being over-counted.
- The health score starts at 50 and adds up to ~35 points for fiber and protein density
  and the share of vegetables, fruit, legumes, whole grains and nuts, then subtracts for
  added sugar, sodium, fat and heavily processed ingredients.

**It is an estimate, not medical or dietary advice.** Coverage is good for common
ingredients and weaker for branded or niche products — the recipe page tells you how
many ingredients matched. A pluggable API key field exists in settings if you later
want to swap in a commercial nutrition API.

---

## Cloud backup & sync

Data is always local-first; cloud sync is a copy.

| Provider | Status |
| --- | --- |
| Local file | ✅ Works (export/import JSON with photos) |
| WebDAV | ✅ Works (Nextcloud, ownCloud, Box, generic) |
| Nextcloud / ownCloud | ✅ Works via the WebDAV preset |
| iCloud Drive | 🔌 Adapter ready — needs a CloudKit container + Apple developer account |
| OneDrive | 🔌 Adapter ready — paste an Azure app client ID |
| Google Drive | 🔌 Adapter ready — paste a Google OAuth client ID |
| Dropbox | 🔌 Adapter ready — paste a Dropbox app key |

For the OAuth providers, register an app with that vendor, then paste the client ID
into *Settings → Cloud & Sync*. The adapters already implement the same
`test / upload / download / list / remove` interface that WebDAV uses, so wiring a
token exchange is the only remaining step. Until then, they show clear setup
instructions instead of failing silently.

---

## Data & privacy

- Recipes, photos and settings live in IndexedDB on your device.
- OCR runs entirely on-device.
- The only network calls are: recipe page fetches (through the proxy), an optional
  cloud sync you configure, and fetching a recipe's photo to store it offline.

---

## Project structure

```
src/
  App.tsx                    app shell + routing between list / recipe / editor
  types.ts                   domain model
  db/database.ts             Dexie schema, settings defaults, id helper
  store/useApp.ts            Zustand store + theme application
  lib/
    colors.ts                the two 8-color palettes
    nutrition-data.ts        bundled ingredient database
    nutrition.ts             ingredient parsing, calorie + health-score math
    importRecipe.ts          JSON-LD / microdata scraping with proxy fallback
    ocr.ts                   photo OCR + text→recipe heuristics
    backup.ts                local export / import
    sync.ts                  WebDAV adapter + OAuth provider adapters
    seed.ts                  starter categories + sample recipe
  components/
    Header.tsx  Sidebar.tsx  CategoryPage.tsx  RecipeCard.tsx
    RecipeView.tsx  RecipeEditor.tsx  CategoryDialog.tsx
    ImportDialog.tsx  SettingsPanel.tsx  TomatoLogo.tsx
    ui/                      Modal, Confirm, Toasts, ColorPicker, NutritionBadge
scripts/gen-icons.mjs        code-generated tomato app icons
src-tauri/                   desktop (macOS / Linux / Windows) shell
capacitor.config.ts          mobile (iOS / iPadOS / Android) shell
```

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check and build `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm run icons` | Regenerate the tomato icons |
| `npm run cap:sync` | Build then sync the Capacitor projects |
| `npm run cap:ios` / `cap:android` | Build, sync and open the native IDE |
| `npm run tauri:dev` / `tauri:build` | Run / package the desktop app |
