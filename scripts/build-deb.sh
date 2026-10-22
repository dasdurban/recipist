#!/usr/bin/env bash
# Builds the Linux .deb for The Recipe App.
#
# A .deb contains a Linux ELF binary linked against webkit2gtk, so it can only
# be produced on Linux - it cannot be cross-built from Windows or macOS. This
# script exists so a Linux machine or VM can go from a fresh clone to an
# installable package with one command.
#
# Usage:
#   bash scripts/build-deb.sh                 # build (assumes dependencies are installed)
#   bash scripts/build-deb.sh --install-deps  # install the system packages first (needs sudo)
#
# The result is:
#   src-tauri/target/release/bundle/deb/the-recipe-app_<version>_amd64.deb
#
# Install it with:
#   sudo apt install ./src-tauri/target/release/bundle/deb/the-recipe-app_*_amd64.deb

set -euo pipefail

# Resolve the repository root from this script's own location, so the script
# works from any working directory.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

install_deps=0
for arg in "$@"; do
  case "$arg" in
    --install-deps) install_deps=1 ;;
    -h | --help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() {
  printf '\n\033[31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

# --- identify the distribution ---------------------------------------------

distro=""
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  distro="${ID:-} ${ID_LIKE:-}"
fi

if [[ ! -f src-tauri/Cargo.toml || ! -f package.json ]]; then
  die "Run this from a checkout of the app: src-tauri/Cargo.toml or package.json is missing."
fi

# --- system dependencies ----------------------------------------------------

# Tauri needs the webkit2gtk development headers, an appindicator library for
# the tray integration, and a linker. The names differ between distributions,
# which is why this is a lookup rather than one fixed list.
apt_packages=(
  build-essential curl wget file libssl-dev libgtk-3-dev
  libwebkit2gtk-4.1-dev librsvg2-dev patchelf
)
dnf_packages=(
  gcc gcc-c++ make curl wget file openssl-devel gtk3-devel
  webkit2gtk4.1-devel librsvg2-devel patchelf
)
pacman_packages=(
  base-devel curl wget file openssl gtk3 webkit2gtk-4.1 librsvg patchelf
)

install_system_deps() {
  case "$distro" in
    *debian* | *ubuntu*)
      # AppIndicator moved to the Ayatana fork on newer releases; older ones
      # only ship the original name.
      local indicator="libayatana-appindicator3-dev"
      if ! apt-cache show "$indicator" >/dev/null 2>&1; then
        indicator="libappindicator3-dev"
      fi
      say "Installing system dependencies with apt"
      sudo apt-get update
      sudo apt-get install -y "${apt_packages[@]}" "$indicator"
      ;;
    *fedora* | *rhel* | *centos*)
      say "Installing system dependencies with dnf"
      sudo dnf install -y "${dnf_packages[@]}" libappindicator-gtk3-devel
      ;;
    *arch*)
      say "Installing system dependencies with pacman"
      sudo pacman -S --needed --noconfirm "${pacman_packages[@]}" libayatana-appindicator
      ;;
    *)
      die "Unrecognised distribution (${distro:-unknown}).
Install the Tauri prerequisites for your platform first, then re-run:
  https://tauri.app/start/prerequisites/
On Debian/Ubuntu the packages are:
  ${apt_packages[*]} libayatana-appindicator3-dev"
      ;;
  esac
}

if [[ $install_deps -eq 1 ]]; then
  install_system_deps
else
  # A quick sanity check so the failure is one clear line instead of a linker
  # error hundreds of lines into the Rust build.
  if command -v pkg-config >/dev/null 2>&1; then
    for lib in webkit2gtk-4.1 gtk+-3.0; do
      if ! pkg-config --exists "$lib"; then
        die "Missing development headers for $lib.
Re-run with --install-deps (needs sudo), or install the Tauri prerequisites:
  https://tauri.app/start/prerequisites/"
      fi
    done
  fi
fi

# --- toolchains -------------------------------------------------------------

# The crate is edition 2024 and declares rust-version 1.90, which is newer than
# the Rust packaged by most distributions. rustup is the reliable way to get it.
required_rust="1.90.0"

version_ge() {
  # True when $1 >= $2, comparing dotted numeric versions.
  [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]
}

if ! command -v cargo >/dev/null 2>&1; then
  say "Installing Rust with rustup"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

rust_version="$(rustc --version | awk '{print $2}')"
if ! version_ge "$rust_version" "$required_rust"; then
  say "Rust $rust_version is too old; installing $required_rust via rustup"
  if ! command -v rustup >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  fi
  rustup toolchain install "$required_rust"
  rustup default "$required_rust"
fi

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is not installed. Install Node 20 or newer (Node 22 recommended):
  https://nodejs.org/ or your distribution's package manager."
fi

node_major="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [[ "$node_major" -lt 20 ]]; then
  die "Node $(node --version) is too old. Install Node 20 or newer."
fi

# --- build ------------------------------------------------------------------

say "Installing frontend dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

# Only the .deb is requested: the default "all" target would also try to build
# an AppImage and an RPM, which need extra tooling and time for no benefit here.
say "Building the .deb"
npx --no-install tauri build --bundles deb

deb="$(find src-tauri/target/release/bundle/deb -maxdepth 1 -name '*.deb' -print -quit 2>/dev/null || true)"
if [[ -z "$deb" ]]; then
  die "The build finished but no .deb was produced. Check the output above."
fi

say "Built $deb"
dpkg-deb -I "$deb" | sed -n '1,20p'
cat <<EOF

Install it with:
  sudo apt install ./$deb

Then launch it from your applications menu, or run:
  recipist

To try it without installing:
  dpkg-deb -x $deb /tmp/recipist-deb
  /tmp/recipist-deb/usr/bin/recipist
EOF
