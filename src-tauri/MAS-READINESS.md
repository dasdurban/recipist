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
| Xcode 26 or later installed | ✅ On the MacBook Neo (Xcode 27 / macOS 27) |
| Data migration for the sandbox container | ✅ Not needed — shipping as a fresh start |
| Apple Distribution certificate | ❓ **The remaining unknown — see below** |
| Mac Installer Distribution certificate | ❓ Needed only for the `.pkg` route |
| App Store Connect listing | ❌ Not started |

The earlier Xcode blocker is resolved: the build now happens on a MacBook Neo
running macOS 27 with Xcode 27, which satisfies the "Xcode 26 or later"
requirement. This machine (macOS 15.7, Command Line Tools only) can still build
and test the direct-download `.dmg`, but cannot produce a submittable bundle.

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

## The certificate, and where to build

The App Store requires the app to be built with **Xcode 26 or later**. That
requirement is met on the build machine (MacBook Neo, macOS 27, Xcode 27), and
`scripts/build-mas.sh` checks it first and stops with instructions if it is not.

Note that the script compares against `26` with `-lt`, so any *newer* Xcode
passes silently. If App Store Connect ever tightens or shifts its accepted SDK,
the build will succeed locally and the upload will be rejected — the check is a
floor, not a guarantee.

The remaining unknown is the **Apple Distribution certificate**, which the script
requires before it starts:

```bash
security find-identity -v -p codesigning | grep "Apple Distribution"
```

Create it with Xcode → Settings → Accounts → (team) → Manage Certificates… → **+**
→ **Apple Distribution**. Let Xcode generate it rather than importing a `.cer`:
a certificate without its private key fails signing with `errSecInternalComponent`,
which is why the script looks for the identity before building rather than
after.

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

### `E174.1` (disk space) was removed, not kept

An earlier revision declared `DiskSpace`/`E174.1` on the assumption that the app
checks free space before writing a backup. It does not. No disk-space API appears
anywhere in the source, and `nm -u` on the release binary imports none of
`statfs`, `statvfs`, `getattrlist` or `volumeAvailableCapacity`.

`E174.1` also requires the app to *visibly* behave differently based on disk
space, which nothing here does. Declaring a category the binary never calls
invites a review question with no good answer, so the manifest omits it. The
reasoning is recorded inline in `PrivacyInfo.xcprivacy` so it is not
re-added by reflex.

Re-add only if a genuine check is introduced — and then only alongside a
user-visible reaction to low space.

A mismatch in either direction is a rejection: a declared-but-unused category
draws a question, and a used-but-undeclared one is an automatic `ITMS-91053`.
`scripts/build-mas.sh` greps `dist/` for `navigator.storage.estimate()` and warns
if it reappears.

## Building on the MacBook Neo

The direct-download `.dmg` can be built anywhere. The App Store bundle cannot:
it needs Xcode and an Apple Distribution certificate. These steps take a
factory-fresh machine to a signed, sandboxed `.app`.

### 1. Xcode

```bash
sudo xcode-select -s /Applications/Xcode.app
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
xcodebuild -version      # must report 26 or later
```

### 2. Node and Rust

```bash
brew install node@24
echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

curl https://sh.rustup.rs -sSf | sh -s -- -y
source "$HOME/.cargo/env"

node --version && npm --version && cargo --version && rustc --version
```

`scripts/build-mas.sh` checks all four before it starts and stops with the exact
command to fix whichever is missing. Rust is the one people trip on: rustup
installs to `~/.cargo/bin`, which is not on `PATH` until `~/.cargo/env` is
sourced, so a new terminal will "lose" `cargo` until that line is in `~/.zshrc`.

### 3. The code

```bash
git clone https://github.com/dasdurban/recipist.git
cd recipist
npm ci
```

`npm ci`, not `npm install`: it installs exactly what `package-lock.json` pins,
and fails loudly if the two have drifted.

### 4. The certificate

Xcode → Settings → Accounts → **+** → add the Apple ID that belongs to the
developer team → select the team → **Manage Certificates…** → **+** →
**Apple Distribution**.

```bash
security find-identity -v -p codesigning | grep "Apple Distribution"
```

This is the only step that cannot be scripted or guessed. If the certificate
already exists on another Mac, it can be exported from Keychain Access as a
`.p12` and imported here — **with its private key**. A certificate without its
private key fails at signing with `errSecInternalComponent`, which is why the
script checks for the identity before building rather than after.

### 5. Build

```bash
./scripts/build-mas.sh 2>&1 | tee /tmp/mas-build.log
```

Cold, with no Rust cache, expect 5–10 minutes; the compile dominates. The script
prints four lines that must all look right:

```
  PrivacyInfo.xcprivacy: present
  app-sandbox: true
  signed by: Apple Distribution: Your Name (TEAMID)
  provisioning profile: none
```

`provisioning profile: none` is correct here — a profile is only required for
capabilities such as iCloud, App Groups or push, none of which this app uses.
If Transporter objects to the missing profile, create a **Mac App Store**
distribution profile for `com.recipist.app` and drop it in as
`Contents/embedded.provisionprofile`; nothing else changes.

The Neo is Apple Silicon, so this `.app` is **arm64 only**. That is fine for the
Store — but it is a different architecture from the x64 `.dmg` built here, so do
not compare the two binaries.

### 6. Package and upload

Transporter takes a **`.pkg`** for macOS apps, not a bare `.app`. Building one
needs a second certificate: Xcode → Manage Certificates… → **+** →
**Mac Installer Distribution**.

```bash
APP="src-tauri/target/release/bundle/macos/The Recipe App.app"
productbuild --component "$APP" /Applications \
  --sign "Mac Installer Distribution: Your Name (TEAMID)" \
  "The Recipe App.pkg"
```

Drag the resulting `.pkg` into Transporter (free on the Mac App Store).

`xcrun altool --upload-app --type macos --file "$APP"` still accepts the `.app`
directly and needs no installer certificate, but Apple has marked it deprecated.
Treat it as the shortcut, and the `.pkg` as the path that will keep working.

## Submitting

The app record must exist in App Store Connect before a build will attach to
anything: create it with bundle ID `com.recipist.app`, name
**Tomato - The Recipe App**, platform macOS.

Then:

1. Upload as above.
2. Complete the listing: description, screenshots, category, age rating. Copy is
   drafted in `MAS-LISTING.md`.
3. **Add the privacy policy URL** (policy requires one for desktop apps):
   `https://dasdurban.github.io/recipist/privacy-policy.html`.
4. Submit for review.

### Version numbers, before every upload

`CFBundleShortVersionString` and `CFBundleVersion` must each be **higher than
every build already uploaded to App Store Connect** — including builds that were
rejected, and builds that were later deleted. Reusing a number fails at upload
with an error that does not explain itself.

`scripts/build-mas.sh` does **not** check this, because it cannot know what has
been uploaded. Raising the version is manual, and it spans five places that must
agree or the About dialog drifts from the bundle:

```
package.json                          version
package-lock.json                     two references
src-tauri/tauri.conf.json             version  (Tauri stamps the bundle from this)
src-tauri/Cargo.toml                  version
src-tauri/Cargo.lock                  recipist entry
```

Regenerate the lockfiles rather than editing them by hand:

```bash
npm install --package-lock-only --no-audit --no-fund
(cd src-tauri && cargo update -p recipist)
```

`npm ci` in CI fails outright if `package.json` and `package-lock.json`
disagree, which is the intended safety net rather than an obstacle.

## Constraints to remember

- **No self-updating.** Staying in the Store means updates go through the Store.
  Do not add a Tauri updater or Sparkle to the MAS build.
- **No license screens or keys** at launch — the app already complies.
- The MAS build and the direct-download build are the same source. Only the
  config, entitlements and signing differ.
