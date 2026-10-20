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

if ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
  die "Xcode is not the active developer directory (got: $(xcode-select -p 2>/dev/null || echo none)).
     App Store submissions must be built with Xcode 26 or later.
     Install Xcode, then run: sudo xcode-select -s /Applications/Xcode.app"
fi
echo "  Xcode: $(xcodebuild -version | head -1)"

for f in src-tauri/entitlements.mas.plist src-tauri/PrivacyInfo.xcprivacy src-tauri/tauri.mas.conf.json; do
  [ -f "$f" ] || die "missing required file: $f"
done
echo "  entitlements:     adopted"
echo "  privacy manifest: adopted"

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
