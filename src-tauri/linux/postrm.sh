#!/bin/sh
# Runs after the .deb is removed. Cleans up the desktop entry that postinst.sh
# copied to the GTK application id, which the package manager does not track.
set -e

APP_ID="com.recipist.app"
DESKTOP_DIR="/usr/share/applications"

rm -f "$DESKTOP_DIR/$APP_ID.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

exit 0
