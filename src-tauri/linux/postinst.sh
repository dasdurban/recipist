#!/bin/sh
# Runs after the .deb is unpacked.
#
# Tauri names the desktop entry after `productName`, which for this app is
# "The Recipe App" (spaces and all). However `app.enableGTKAppId` gives the
# window the GTK application id from `identifier`, i.e. com.recipist.app.
#
# GNOME and other Wayland compositors associate a running window with the
# desktop entry *of the same file name*: they look for com.recipist.app.desktop
# and, when it is missing, fall back to a generic icon in the dock and the app
# switcher.
#
# Renaming keeps exactly one entry: it is named for the app id, so Wayland and
# GNOME find it, and its StartupWMClass=recipist line still lets X11 desktops
# match the window by WM_CLASS. A second entry with the same Name is a second
# icon in the menu, so anything else in the system application directories that
# launches the same binary is removed too — those files are leftovers from an
# older install or a discarded AppImage, never something this package needs.
set -e

APP_ID="com.recipist.app"
DESKTOP_DIR="/usr/share/applications"
TARGET="$DESKTOP_DIR/$APP_ID.desktop"

# The package's own entry, plus any strays in the other system data directory
# (XDG_DATA_DIRS defaults to /usr/local/share:/usr/share). User-level entries
# in ~/.local/share/applications are left alone: they belong to the user.
set --
for dir in "$DESKTOP_DIR" /usr/local/share/applications; do
  [ -d "$dir" ] || continue
  for f in "$dir"/*.desktop; do
    [ -e "$f" ] || continue
    [ "$f" = "$TARGET" ] && continue
    # Exec is written by the template as `recipist`; accept a field-code
    # suffix too, in case a future template adds %U.
    if grep -q '^Exec=recipist\([[:space:]]\|$\)' "$f" 2>/dev/null; then
      set -- "$@" "$f"
    fi
  done
done

# The first candidate is the entry the build generated; the rest are strays.
if [ "$#" -gt 0 ]; then
  mv -f "$1" "$TARGET"
  shift
  for f in "$@"; do
    rm -f "$f"
  done
fi

# Refresh the desktop database so the rename is picked up immediately.
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

# KDE keeps its own service cache; rebuild it when the tooling is present.
for cache in kbuildsycoca6 kbuildsycoca5; do
  if command -v "$cache" >/dev/null 2>&1; then
    "$cache" >/dev/null 2>&1 || true
    break
  fi
done

# Refresh the icon cache if the tooling is present. Both calls are optional:
# a headless install may not have them, and neither is fatal.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

exit 0
