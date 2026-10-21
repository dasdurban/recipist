#!/usr/bin/env bash
#
# Builds the Mac App Store variant of The Recipe App.
#
# The App Store build differs from the direct-download build in three ways:
#   1. It is sandboxed (entitlements.mas.plist).
#   2. It carries a privacy manifest (PrivacyInfo.xcprivacy).
#   3. It is signed with an "Apple Distribution" identity, not a Developer ID.
#
# The .dmgg produced by the normal `npx tauri build` is untouched; this script
# merges tauri.mas.conf.json on top of the base config so that the two builds
# can coexist.
#
# Usage:
#   ./scripts/build-mas.sh                 # build + sign, ready for Transporter
#   SIGN_IDENTITY="Apple Distribution: ..." ./scripts/build-mas.sh
#
# Requirements (all on the machine doing the build):
#   - Xcode installed and selected (xcode-select -p must point at Xcode.app)
#   - An "Apple Distribution" certificate in the login keychain
#   - A provisioning profile for com.recipist.app (for some capabilities)
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ preflight ---

bold "Checking toolchain"

# node and npx are needed twice over: `npx tauri` runs the build itself, and the
# preflight below reads tauri.conf.json through node. Without them the build dies
# partway through with a message that does not name the cause — the identifier
# check degrades to "(could not read)" and the privacy check to "unknown", both
# of which look cosmetic rather than fatal. Checking up front turns a confusing
# late failure into an immediate, named one.
if ! command -v node >/dev/null 2>&1; then
  die "node is not on PATH.
     The build runs through npx, and the checks below read tauri.conf.json
     through node, so neither can work without it.
     Install Node, or add it to PATH for this shell:
       export PATH=\"/opt/homebrew/bin:\$PATH\"     # Apple Silicon Homebrew
       export PATH=\"/usr/local/bin:\$PATH\"        # Intel Homebrew
     Then confirm with:  node --version"
fi
echo "  node: $(node --version)"

if ! command -v npm >/dev/null 2>&1; then
  die "npm is not on PATH (node is, at $(command -v node)).
     npm ships with Node, so this usually means PATH is half-configured rather
     than Node being absent."
fi
echo "  npm:  $(npm --version)"

# A checkout with no node_modules cannot build, and `npx tauri` would otherwise
# try to fetch the CLI from the network mid-build.
if [ ! -d node_modules ]; then
  die "node_modules is missing. Run 'npm ci' first.
     Use ci rather than install: it installs exactly what package-lock.json
     pins, and fails loudly if that file has drifted from package.json."
fi

if ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
  die "Xcode is not the active developer directory (got: $(xcode-select -p 2>/dev/null || echo none)).
     App Store submissions must be built with Xcode 26 or later.
     Install Xcode, then run: sudo xcode-select -s /Applications/Xcode.app"
fi
echo "  Xcode: $(xcodebuild -version | head -1)"

# The App Store requires uploads to be built with a recent SDK. Checking the
# version here turns a rejection at upload time into a message before the build.
XCODE_MAJOR="$(xcodebuild -version 2>/dev/null | head -1 | sed -E 's/Xcode[[:space:]]+([0-9]+).*/\1/')"
if [ -n "$XCODE_MAJOR" ] && [ "$XCODE_MAJOR" -lt 26 ] 2>/dev/null; then
  echo "  warning: Xcode $XCODE_MAJOR detected. App Store Connect currently expects"
  echo "           builds from Xcode 26 or later; older SDKs are rejected at upload."
fi

for f in src-tauri/entitlements.mas.plist src-tauri/PrivacyInfo.xcprivacy src-tauri/tauri.mas.conf.json; do
  [ -f "$f" ] || die "missing required file: $f"
done
echo "  entitlements:     adopted"
echo "  privacy manifest: adopted"

# Validate the plists now. A malformed privacy manifest is rejected by App
# Store Connect with an opaque error, so it is worth catching locally.
plutil -lint src-tauri/entitlements.mas.plist >/dev/null || die "entitlements.mas.plist is not a valid plist"
plutil -lint src-tauri/PrivacyInfo.xcprivacy >/dev/null || die "PrivacyInfo.xcprivacy is not a valid plist"
echo "  plists valid"

# The bundle identifier in tauri.conf.json must match the provisioning profile
# and the App Store Connect record, or the upload fails.
# node is confirmed present above, so a failure here is a real problem rather
# than a missing tool: either the config is unreadable or the identifier is gone.
BUNDLE_ID="$(node -e "process.stdout.write(require('./src-tauri/tauri.conf.json').identifier)" 2>/dev/null || true)"
[ -n "$BUNDLE_ID" ] || die "could not read the bundle identifier from src-tauri/tauri.conf.json.
     App Store Connect binds the upload to this value, so the build cannot proceed
     without it."
echo "  bundle identifier: $BUNDLE_ID"

# Level the privacy manifest against the binary. A required-reason category
# declared for an API the app never calls invites a review question, and a
# category that IS called but is undeclared is an automatic rejection
# (ITMS-91053). Both are cheap to check here.
PRIVACY_CHECK="$(node -e '
const fs = require("fs");
const path = "src-tauri/PrivacyInfo.xcprivacy";
const text = fs.readFileSync(path, "utf8");
const declared = [];
if (text.includes("NSPrivacyAccessedAPICategoryFileTimestamp")) declared.push("FileTimestamp");
if (text.includes("NSPrivacyAccessedAPICategoryDiskSpace")) declared.push("DiskSpace");
if (text.includes("NSPrivacyAccessedAPICategoryUserDefaults")) declared.push("UserDefaults");
if (text.includes("NSPrivacyAccessedAPICategorySystemBootTime")) declared.push("SystemBootTime");
if (text.includes("NSPrivacyAccessedAPICategoryActiveKeyboards")) declared.push("ActiveKeyboards");
process.stdout.write(declared.join(",") || "none");
' 2>/dev/null || true)"
[ -n "$PRIVACY_CHECK" ] || die "could not read the privacy categories from src-tauri/PrivacyInfo.xcprivacy.
     This file was linted as a valid plist above, so a failure here means the
     manifest cannot be parsed by node."
echo "  privacy categories declared: $PRIVACY_CHECK"

# Check that the JS bundle shipped in dist/ does not call a disk-space API,
# since the manifest no longer declares that category.
if [ -d dist ]; then
  if grep -rqE "navigator\.storage\.estimate|storage\.estimate\(\)" dist 2>/dev/null; then
    echo "  warning: dist/ calls navigator.storage.estimate(), which is a disk-space"
    echo "           API. Re-add NSPrivacyAccessedAPICategoryDiskSpace to the privacy"
    echo "           manifest, or the upload is rejected under ITMS-91053."
  fi
fi

# Verify the signing identity exists, and let the user pick it if it was not
# supplied. This avoids the "errSecInternalComponent" signing failures that are
# otherwise very hard to read.
if [ -z "${SIGN_IDENTITY:-}" ]; then
  SIGN_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep -o '"Apple Distribution: [^"]*"' | head -1 | tr -d '"' || true)"
fi

if [ -z "${SIGN_IDENTITY:-}" ]; then
  echo
  echo "  Available code-signing identities:"
  security find-identity -v -p codesigning 2>/dev/null | sed 's/^/    /' || true
  die "no 'Apple Distribution' identity found.
     Create one in Xcode: Settings > Accounts > Manage Certificates > Apple Distribution."
fi
echo "  signing identity: $SIGN_IDENTITY"

# --------------------------------------------------------------------- build ---

bold "Building the frontend and Rust binary"
# --no-bundle: we bundle separately below so the MAS config can be merged in
# without also producing a .dmg.
npx tauri build --no-bundle

bold "Bundling the .app with the sandbox and privacy manifest"
npx tauri bundle --config src-tauri/tauri.mas.conf.json

APP="src-tauri/target/release/bundle/macos/The Recipe App.app"
[ -d "$APP" ] || die "expected bundle not found at $APP"

# ------------------------------------------------------------------- verify ---

bold "Verifying the bundle"

# The privacy manifest must be inside the bundle or the upload is rejected.
if [ -f "$APP/Contents/Resources/PrivacyInfo.xcprivacy" ]; then
  echo "  PrivacyInfo.xcprivacy: present"
else
  die "PrivacyInfo.xcprivacy is NOT inside the bundle — the submission would be rejected.
     Check bundle.macOS.files in tauri.mas.conf.json."
fi

# Confirm the sandbox entitlement actually landed. A missing app-sandbox key is
# an instant rejection under Guideline 2.4.5, and it is invisible in the UI.
echo "  entitlements in signed binary:"
codesign -d --entitlements - --xml "$APP" 2>/dev/null \
  | plutil -convert xml1 -o - - 2>/dev/null \
  | grep -A1 "app-sandbox" | head -3 | sed 's/^/    /' \
  || echo "    (not yet signed — expected before the sign step)"

# --------------------------------------------------------------------- sign ---

bold "Signing with: $SIGN_IDENTITY"
codesign --force --deep --options runtime --timestamp \
  --entitlements src-tauri/entitlements.mas.plist \
  --sign "$SIGN_IDENTITY" \
  "$APP"

bold "Re-verifying the signature"
codesign --verify --deep --strict --verbose=2 "$APP"
echo "  signature valid"

# The sandbox flag must read true in the final signed bundle.
SANDBOX="$(codesign -d --entitlements - --xml "$APP" 2>/dev/null \
  | plutil -convert json -o - - 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j["com.apple.security.app-sandbox"]))}catch{process.stdout.write("unknown")}})')"

if [ "$SANDBOX" = "true" ]; then
  echo "  app-sandbox: true"
else
  die "app-sandbox did not end up in the signed entitlements (got: $SANDBOX).
     Guideline 2.4.5 requires it. Check entitlements.mas.plist."
fi

# Report the signing authority, so the certificate that actually signed the
# bundle is visible rather than assumed. An App Store upload needs an
# "Apple Distribution" certificate; a "Developer ID Application" one is for
# direct download and is rejected by the Store.
AUTHORITY="$(codesign -dv --verbose=4 "$APP" 2>&1 | sed -n 's/^Authority=//p' | head -1)"
echo "  signed by: ${AUTHORITY:-unknown}"

case "$AUTHORITY" in
  *"Apple Distribution"*|*"3rd Party Mac Developer Application"*)
    ;;
  "Developer ID Application"*)
    die "the bundle is signed with a Developer ID certificate, which the Mac App
     Store rejects. Use an 'Apple Distribution' identity:
       SIGN_IDENTITY='Apple Distribution: Your Name (TEAMID)' $0"
    ;;
esac

# The provisioning profile is only required when the app uses capabilities
# beyond the defaults. Report whether one is embedded rather than failing, so
# the script works for a plain sandboxed app and flags the case that needs one.
if [ -f "$APP/Contents/embedded.provisionprofile" ]; then
  echo "  provisioning profile: embedded"
else
  echo "  provisioning profile: none"
  echo "    (fine unless the app enables iCloud, App Groups, or push, which need one)"
fi

cat <<EOF

$(bold "Done.")

  Bundle:  $APP
  Next:    upload it to App Store Connect with Transporter, or:

    xcrun altool --upload-app \\
      --type macos \\
      --file "src-tauri/target/release/bundle/macos/The Recipe App.app" \\
      --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>

  Upload the .app (not the .dmg) — Apple's tooling packages it for the Store.
EOF
