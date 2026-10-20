# Mac App Store readiness

Notes for shipping The Recipe App through the Mac App Store (MAS). This is
separate from the direct-download `.dmg`, which stays unsandboxed and is
unaffected by everything here.

## Status

| Requirement | State |
|---|---|
| Apple Developer Program membership | **You have it** |
| App Sandbox (Guideline 2.4.5) | ✅ `src-tauri/entitlements.mas.plist` |
| Privacy manifest | ✅ `src-tauri/PrivacyInfo.xcprivacy` |
| Signing + packaging config | ✅ `src-tauri/tauri.mas.conf.json` |
| Build script | ✅ `scripts/build-mas.sh` |
| Privacy policy | ✅ Written, and live |
| **Xcode 26 or later installed** | ❌ **Blocked — see below** |
| Data migration for the sandbox container | ✅ Not needed — shipping as a fresh start |
| App Store Connect listing | ❌ Not started |

## Privacy policy

Published via GitHub Pages from `docs/`:

**https://dasdurban.github.io/recipist/privacy-policy.html**

Contact address shown on the listing: `dasleveille@gmail.com`.

Source of truth is `docs/privacy-policy.md` and `docs/privacy-policy.html` in this
repo. Editing either file on `main` redeploys the page automatically
(`.github/workflows/pages.yml`).

> **Dependency:** GitHub Pages requires a **public** repository on the free plan.
> If this repo is made private again, the URL stops serving and the workflow
> fails at `configure-pages`. Apple requires a policy **URL** (Microsoft also
> accepts pasted text), so if that happens, host `docs/` elsewhere
> (Cloudflare Pages, Netlify) or upgrade the plan.

## Blocker 1: Xcode

The App Store requires the app to be built with **Xcode 26 or later**. This
machine has only the Command Line Tools:

```
xcode-select -p  ->  /Library/Developer/CommandLineTools
```

`scripts/build-mas.sh` checks this first and stops with instructions. Fix:

1. Install Xcode (from the App Store or developer.apple.com).
2. `sudo xcode-select -s /Applications/Xcode.app`
3. `xcodebuild -version` should print 26.x or later.

Note: this machine is on macOS 15.7.7. If Xcode 26 requires a newer macOS, an
OS upgrade is a prerequisite.

## Blocker 2: the sandbox moves the data directory

**Settled as a non-issue: ship the MAS build as a fresh start.**

Today (unsandboxed) WebKit stores the app's data at:

```
~/Library/WebKit/com.recipist.app/WebsiteData/IndexedDB/
```

Once the app is sandboxed, macOS relocates that to the container:

```
~/Library/Containers/com.recipist.app/Data/Library/WebKit/
```

The app would therefore start with **no recipes**, because it is looking in a
directory it has never written to.

That affects only someone upgrading from the direct-download build. Since there
is no user base yet, there is nobody in that position: every build so far is a
test build, so this is a theoretical concern rather than a migration to write.
No helper, no first-launch copy, no release-notes caveat.

The other option was a one-time migration that detects the pre-sandbox store
and copies it into the container. It is worth recording why that was rejected
rather than merely postponed: **it cannot be done with the sandbox enabled.** A
sandboxed app has no read access to `~/Library/WebKit/`, so it would need a
temporary unsandboxed helper or a manual export/import. That is a real project,
and there is no data in the wild that would justify it.

This only becomes live again if an unsandboxed build ships to real users before
the sandboxed one does. At that point the answer is the app's existing backup
and export: export from the old build, import into the new one.

## What was declared, and why

### Entitlements (`entitlements.mas.plist`)

| Entitlement | Why it is needed |
|---|---|
| `app-sandbox` | Mandatory for MAS |
| `network.client` | Recipe import, OCR worker download, WebDAV/cloud sync |
| `files.user-selected.read-only` | Opening a photo for OCR, opening a backup file |
| `files.user-selected.read-write` | Saving a backup file |
| `print` | The print feature |

Deliberately **not** declared: `network.server` (the app listens on nothing),
camera/microphone (photos come from disk, not capture).

### Privacy manifest (`PrivacyInfo.xcprivacy`)

- `NSPrivacyTracking: false` — there is no analytics, telemetry, ad SDK or
  fingerprinting anywhere in the codebase (verified by search).
- Three collected-data entries, all `linked: false` and `tracking: false`:
  - `OtherUserContent` — the recipes the user creates or imports
  - `PhotosorVideos` — images imported for OCR
  - `OtherDataTypes` — the user's own sync credentials for their own provider
- Three required-reason API categories:
  - `FileTimestamp` / `C617.1` — timestamps of files in the app container
  - `UserDefaults` / `CA92.1` — IndexedDB and the timer's localStorage
  - `DiskSpace` / `E174.1` — checking space before writing a backup

Verified against Apple's published reason-code list.

**Per-bundle rule:** Apple requires a manifest for *each* bundle that touches a
required-reason API. This app is self-contained (Rust links statically, no
bundled `.dylib`/`.framework` — verified against the built app), so one manifest
covers everything. If a future dependency ships its own dynamic library, it
needs its own manifest.

### One open question about `E174.1`

`E174.1` requires that the app *visibly* behaves differently based on disk
space. If nothing in the UI changes when space is low, this declaration is not
accurate for a dependency doing the check silently. Confirm the app surfaces a
"storage is full" message before submitting, or drop this category.

## Building and submitting

```bash
./scripts/build-mas.sh
```

The script verifies the toolchain, builds, bundles with the MAS config, checks
the privacy manifest is inside the bundle and that `app-sandbox` is present in
the signed entitlements, signs with your Apple Distribution identity, and prints
the upload command.

Then:

1. Upload the **`.app`** (not a `.dmg`) with Transporter or `xcrun altool`.
2. In App Store Connect, complete the listing: description, screenshots,
   category, age rating.
3. **Add the privacy policy URL.** Policy requires one for desktop apps; you
   have none yet.
4. Submit for review.

## Constraints to remember

- **No self-updating.** Staying in the Store means updates go through the Store.
  Do not add a Tauri updater or Sparkle to the MAS build.
- **No license screens or keys** at launch — the app already complies.
- The MAS build and the direct-download build are the same source. Only the
  config, entitlements and signing differ.
