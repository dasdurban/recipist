#!/bin/sh
# Runs after the .deb is unpacked.
#
# Tauri names the desktop entry after `productName`, which for this app is
# "The Recipe App" (spaces and all). However `app.enableGTKAppId` gives the
# window the GTK application id from `identifier`, i.e. com.recipist.app.
#
# GNOME and other Wayland compositors match a running window to its desktop
# entry by application id. They look for com.recipist.app.desktop, do not
# find it, and fall back to a generic icon in the dock and the app switcher.
#
# Renaming (actually copying) the entry to the app id fixes that lookup while
# keeping the friendly "The Recipe App" display name inside the file.
set -e

APP_ID="com.recipist.app"
DESKTOP_DIR="/usr/share/applications"

# Tauri derives the filename from productName. Match it loosely so this keeps
# working if the display name ever changes.
SOURCE=""
for f in "$DESKTOP_DIR"/*.desktop; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in
    "$APP_ID.desktop") continue ;;
  esac
  # Only adopt a file that this package is responsible for.
  if grep -q '^Exec=recipist$' "$f" 2>/dev/null; then
    SOURCE="$f"
    break
  fi
done

if [ -n "$SOURCE" ]; then
  cp -f "$SOURCE" "$DESKTOP_DIR/$APP_ID.desktop"
fi

# Refresh the desktop database so the new entry is picked up immediately.
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

# Refresh the icon cache if the tooling is present. Both calls are optional:
# a headless install may not have them, and neither is fatal.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

exit 0
