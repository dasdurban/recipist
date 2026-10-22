# Save to Recipes — browser extension

A toolbar button that sends the recipe page you are reading to The Recipe App.

This is the version of "save from the browser" that can carry the app's icon.
A `javascript:` bookmarklet — what `docs/save-to-recipe-app.html` installs — is
given a generic symbol by every browser, and there is no API to set one. A
toolbar button takes its icon from the manifest, so it looks like part of the
product and sits next to the address bar the way an app button should.

Both routes end in the same place: the `recipist://import?url=…` link the app
registers with the operating system.

## What is in here

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3, shared by Chrome, Edge and (via conversion) Safari |
| `background.js` | The click handler; hands the active tab's address to the app |
| `icons/` | 16, 32, 48 and 128px, cut from `public/icons/icon-1024.png` |

## How the hand-off works

On click the service worker reads the active tab's URL, rejects anything that
is not `http` or `https`, and sets `location.href` on the page to the deep link.
That is exactly what the bookmarklet does, and it is what has already been
proven to reach the app on all three desktop platforms.

Doing it from inside the page matters: navigating the tab itself with
`chrome.tabs.update` leaves the user on a blank page after the app opens, while
setting the location lets the browser keep showing the recipe.

The two permissions are the minimum for that:

- `activeTab` — read the address of the tab the user clicked on, and nothing
  else. No host permissions, so the extension cannot see other tabs or run
  anywhere on its own.
- `scripting` — write that one assignment into the page.

## Load it locally (Chrome, Edge, Brave, Vivaldi)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode**.
3. **Load unpacked** and choose this `extension/` directory.
4. Click the puzzle-piece icon and pin **Save to Recipes** to the toolbar.

Clicking the button on a recipe page opens The Recipe App. The first click
makes the browser ask whether to allow the app to open — choose **Always
allow**.

## Package it for a store

```bash
scripts/build-extension.sh
```

That writes `dist/save-to-recipes-extension.zip`. Both the Chrome Web Store and
Edge Add-ons take that file as-is; it validates the manifest and checks that
every icon it references exists before zipping, because a missing icon is
otherwise only discovered at upload.

The zip has `manifest.json` at its root. Zipping the folder instead —
`zip -r out.zip extension` — produces `extension/manifest.json` and is rejected.

## Safari

Safari cannot load an unpacked directory, but it takes the same web extension
after Xcode wraps it:

```bash
xcrun safari-web-extension-converter extension/ \
  --app-name "Save to Recipes" \
  --bundle-identifier com.recipist.app.safari \
  --force
```

Open the generated project in Xcode, set a signing team, and run. The extension
then appears in Safari → Settings → Extensions and has to be enabled there.
Distribution on the App Store requires that same Xcode project, so keep it.

Note that Safari shows its own permission prompt the first time the button is
used, separately from the macOS "open The Recipe App?" prompt.

## Firefox

`background.js` uses the `chrome.*` promise API, which Firefox supports, but
Firefox wants `background.scripts` rather than a service worker for MV3 and
requests `browser_specific_settings`. It is not covered here because the
bookmarklet already works there and Firefox is not a store target.

## Testing checklist

These are the cases that have actually broken browser hand-offs before:

- [ ] A normal recipe page opens the app and imports it.
- [ ] A second click on the same page imports it again rather than doing
      nothing.
- [ ] A `chrome://` or `about:` page shows the red **!** badge and does not
      open the app.
- [ ] A PDF or the Web Store page falls back to navigating the tab and still
      opens the app.
- [ ] With the app closed, the click launches it and the import completes.
- [ ] With the app already open, the recipe appears without a second app window.

## Store notes

| Store | Cost | Notes |
| --- | --- | --- |
| Chrome Web Store | one-off USD 5 developer fee | Review is usually a few days; the listing needs a screenshot and a privacy-policy URL (`https://dasdurban.github.io/recipist/privacy-policy.html`) |
| Edge Add-ons | free | Accepts the same zip |
| Safari / App Store | Apple Developer account | Needs the Xcode conversion above |

The extension sends nothing anywhere. It reads one URL from the tab the user
clicked and passes it to a local app, which is worth saying plainly in the
privacy policy and the store listing — "no data collected" is accurate here.
