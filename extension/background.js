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

  // Navigate the tab from the extension, not from inside the page.
  //
  // Running `location.href = …` in the page was the original approach, because
  // it is exactly what the bookmarklet does. It does not work here: Chrome
  // requires a user gesture for an external-protocol navigation started by a
  // page, and this click happened in browser chrome, not in the page. Injected
  // script carries no activation, so Chrome drops the navigation silently —
  // no error, no prompt, nothing at all.
  //
  // An extension-initiated tab navigation is not subject to that rule, so
  // handing the tab to the protocol this way is what actually launches the app.
  // The page stays put: the browser intercepts the unknown scheme and hands it
  // to the OS instead of completing the navigation.
  try {
    await chrome.tabs.update(tab.id, { url: target })
    console.info('[save-to-recipes] handed off via tabs.update')
    return
  } catch (error) {
    console.warn('[save-to-recipes] tabs.update refused the hand-off', error)
  }

  // Some builds refuse to navigate an existing tab to an unknown scheme. A new
  // tab is the other extension-initiated route, and is how the "open in …"
  // style extensions do it.
  try {
    await chrome.tabs.create({ url: target, active: true })
    console.info('[save-to-recipes] handed off via tabs.create')
    return
  } catch (error) {
    console.warn('[save-to-recipes] tabs.create refused the hand-off', error)
  }

  // Last resort: let the page try. Works where the page does hold activation,
  // and costs nothing when it does not.
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
  } catch (error) {
    console.error('[save-to-recipes] could not reach The Recipe App', error)
    flashBadge(tab.id, '!')
  }
}
