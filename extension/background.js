/**
 * Save to Recipes — toolbar button.
 *
 * Clicking the button hands the current tab's address to The Recipe App through
 * the `recipist://import` link the app registers with the operating system.
 *
 * This exists because a `javascript:` bookmarklet cannot carry the app's icon:
 * browsers give those bookmarks a generic symbol and offer no way to set one.
 * A toolbar button has a real icon from the manifest, so this is the version
 * that looks like part of the product.
 *
 * The hand-off is deliberately the same one the bookmarklet performs — set
 * `location.href` on the page — because that is the route already proven to
 * reach the app on macOS, Windows and Linux. Writing the location from inside
 * the page keeps the browser showing the recipe instead of navigating away to
 * a blank tab, which is what `tabs.update` would do.
 */

/** The deep link route the app accepts. Anything else is ignored by the app. */
const IMPORT_ROUTE = 'recipist://import'

/**
 * Marks the request as coming from the extension.
 *
 * The app treats unknown query parameters as noise, so this is only useful for
 * telling the two entry points apart while diagnosing a report — it does not
 * change what gets imported.
 */
const SOURCE = 'extension'

chrome.action.onClicked.addListener((tab) => {
  void saveCurrentPage(tab)
})

/**
 * Only real web pages can be imported. The app rejects anything else as well,
 * but failing here keeps a stray `chrome://` or `file://` click from opening
 * the app just to have it refuse the URL.
 */
function isWebPage(url) {
  return typeof url === 'string' && /^https?:/i.test(url)
}

function clearBadge(tabId) {
  if (tabId === undefined) return
  void chrome.action.setBadgeText({ tabId, text: '' })
}

/** Shows a short "!" on the button, then clears it. */
function flashBadge(tabId, text) {
  if (tabId === undefined) return
  void chrome.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' })
  void chrome.action.setBadgeText({ tabId, text })
  setTimeout(() => clearBadge(tabId), 3000)
}

async function saveCurrentPage(tab) {
  if (!tab || tab.id === undefined) return

  clearBadge(tab.id)

  if (!isWebPage(tab.url)) {
    flashBadge(tab.id, '!')
    return
  }

  const target = `${IMPORT_ROUTE}?ref=${SOURCE}&url=${encodeURIComponent(tab.url)}`

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      // Runs in the page, so this has to be self-contained: no closures over
      // anything above, which is why the link arrives as an argument.
      func: (href) => {
        window.location.href = href
      },
      args: [target],
    })
  } catch {
    // Sometimes a page refuses injection — a PDF viewer, the Web Store, a
    // privileged URL. Navigating the tab works there and is the same hand-off
    // the browser would have made anyway.
    try {
      await chrome.tabs.update(tab.id, { url: target })
    } catch {
      flashBadge(tab.id, '!')
    }
  }
}
