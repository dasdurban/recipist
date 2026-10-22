#!/usr/bin/env bash
#
# Packages the browser extension for the Chrome Web Store and Edge Add-ons.
#
# Both stores take the same upload: a zip whose *root* contains manifest.json.
# Zipping the folder itself (`zip -r out.zip extension`) produces
# `extension/manifest.json`, which the stores reject, so the members are listed
# from inside the directory instead.
#
# Usage: scripts/build-extension.sh
#
# Output: dist/save-to-recipes-extension.zip

set -euo pipefail

cd "$(dirname "$0")/.."

SRC="extension"
OUT="dist/save-to-recipes-extension.zip"

if [ ! -f "$SRC/manifest.json" ]; then
  echo "error: $SRC/manifest.json is missing" >&2
  exit 1
fi

# The manifest drives everything else, so a typo here should stop the build
# rather than produce a package that fails at upload time.
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
    const problems = [];
    if (m.manifest_version !== 3) problems.push("manifest_version must be 3");
    for (const key of ["name", "version", "action", "background"]) {
      if (!m[key]) problems.push(`missing "${key}"`);
    }
    // Every icon the manifest references has to exist, or the button shows a
    // blank square in the browser and the store listing looks broken.
    const refs = new Set(Object.values(m.icons || {}));
    for (const size of Object.values((m.action && m.action.default_icon) || {})) refs.add(size);
    for (const rel of refs) {
      if (!fs.existsSync(`extension/${rel}`)) problems.push(`missing icon: ${rel}`);
    }
    if (problems.length) {
      console.error("error: " + problems.join("; "));
      process.exit(1);
    }
  '
else
  echo "warning: node not found, skipping manifest validation" >&2
fi

mkdir -p dist
rm -f "$OUT"

# -X drops the extra file attributes macOS would otherwise attach, which some
# store validators treat as an unknown member.
( cd "$SRC" && zip -qr -X "../$OUT" manifest.json background.js icons )

echo "wrote $OUT"
unzip -l "$OUT" | sed -n '1,20p'
