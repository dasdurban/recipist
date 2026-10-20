#!/usr/bin/env bash
#
# Verifies that the Windows installer installs WebView2 offline.
#
# The Microsoft Store requires an offline installer — "no downloads during
# setup" — for both MSIX and plain EXE/MSI submissions. Tauri's default,
# downloadBootstrapper, fetches the runtime from go.microsoft.com during
# install, which disqualifies the package.
#
# With bundle.windows.webviewInstallMode = offlineInstaller, Tauri embeds the
# Evergreen standalone installer at build time. This script proves the
# difference by looking for the markers of each mode.
#
# Usage: scripts/check-offline-installer.sh <path-to-msi-or-exe> [more...]

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <installer> [installer...]" >&2
  exit 2
fi

# Markers of the download mode: if any of these appear, setup touches the
# network and the package will fail Store certification.
DOWNLOAD_MARKERS=(
  "DownloadAndInvokeBootstrapper"
  "go.microsoft.com/fwlink/p/?LinkId=2124703"
  "MicrosoftEdgeWebview2Setup"
)

# Markers of the embedded mode: the standalone runtime installer is inside the
# package.
OFFLINE_MARKERS=(
  "InvokeStandalone"
  "MicrosoftEdgeWebView2RuntimeInstaller"
)

fail=0

for installer in "$@"; do
  if [ ! -f "$installer" ]; then
    echo "MISSING: $installer" >&2
    fail=1
    continue
  fi

  echo "== $(basename "$installer")"
  echo "   $(( $(stat -f%z "$installer" 2>/dev/null || stat -c%s "$installer") / 1048576 )) MB"

  # -a so binary content is scanned rather than skipped.
  strings -a "$installer" > /tmp/offline-check-strings.txt || true

  found_download=0
  for marker in "${DOWNLOAD_MARKERS[@]}"; do
    if grep -qF "$marker" /tmp/offline-check-strings.txt; then
      echo "   DOWNLOAD MARKER PRESENT: $marker"
      found_download=1
      fail=1
    fi
  done

  found_offline=0
  for marker in "${OFFLINE_MARKERS[@]}"; do
    if grep -qF "$marker" /tmp/offline-check-strings.txt; then
      echo "   offline marker present: $marker"
      found_offline=1
    fi
  done

  if [ "$found_download" -eq 1 ]; then
    echo "   RESULT: FAIL — setup downloads WebView2, so the Store will reject it"
  elif [ "$found_offline" -eq 1 ]; then
    echo "   RESULT: PASS — WebView2 is embedded, setup needs no network"
  else
    echo "   RESULT: INCONCLUSIVE — no WebView2 markers found at all"
    echo "           (the machine may already have WebView2 via a dependency,"
    echo "            so check the bundle config before assuming this is fine)"
    fail=1
  fi

  rm -f /tmp/offline-check-strings.txt
  echo
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "All installers install WebView2 offline."
