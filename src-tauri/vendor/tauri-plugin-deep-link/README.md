# tauri-plugin-deep-link, vendored and patched

A verbatim copy of [`tauri-plugin-deep-link` 2.6.2](https://crates.io/crates/tauri-plugin-deep-link/2.6.2)
with a **single** change, wired in through `[patch.crates-io]` in
`src-tauri/Cargo.toml`.

## Why

`rust-ini` 0.21.3 added two fields to `ini::ParseOption`. This plugin still
constructs that struct with only the original two, so it fails to compile:

```
error[E0063]: missing fields `enabled_indented_mutiline_value` and
              `enabled_preserve_key_leading_whitespace` in initializer of `ParseOption`
error: could not compile `tauri-plugin-deep-link` (lib)
```

Three things made this unpleasant to handle normally:

- The code is `#[cfg(target_os = "linux")]`, so macOS and Windows build fine and
  **only Linux fails** — which is how it reached CI unnoticed.
- 2.6.2 is the newest stable 2.x, so there is nothing to upgrade to.
- The last release that still compiles, `rust-ini` 0.21.2, was **yanked**, so it
  cannot be pinned either. A fresh `cargo` resolve rejects it even when the
  lockfile names it.

## The change

`src/lib.rs`, in `load_desktop_ini` — search for `PATCH`. The two new fields
default to `false` in `rust-ini`'s own `Default` impl, and `false` is the
correct behaviour here: this function parses a `.desktop` file so quotes and
escapes survive a rewrite, and neither multi-line values nor leading key
whitespace are involved.

## Removing this

When upstream supports `rust-ini` 0.21.3:

1. Delete this directory.
2. Delete the `[patch.crates-io]` block at the end of `src-tauri/Cargo.toml`.
3. Run `cargo update -p tauri-plugin-deep-link`.

Nothing else refers to it.
