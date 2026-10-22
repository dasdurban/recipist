import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { TimerWindow } from './components/TimerWindow'
import { isTauri, isTimerWindow } from './lib/native'
import { purgeServiceWorker } from './lib/pwa'
import { initTimerSync } from './lib/timerSync'
import { applyTimerSnapshot, timerSnapshot } from './store/useApp'
import './index.css'

// On the desktop the timer can live in a window of its own. That window runs
// the same bundle but shows only the dial, and the two windows keep each other
// in step (see lib/timerSync).
const timerOnly = isTimerWindow()
initTimerSync(applyTimerSnapshot, timerSnapshot, timerOnly)

function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>{timerOnly ? <TimerWindow /> : <App />}</React.StrictMode>,
  )
}

void (async () => {
  if (isTauri()) {
    // The desktop app has no service worker: its assets are in the binary, and
    // a worker would keep serving the bundle of whichever version cached it
    // first. An install that predates this still has one, so it is cleared out
    // here; a page that was being served from the cache is reloaded to pick up
    // the build that is actually installed.
    if (await purgeServiceWorker()) return
  } else {
    // Keep the installed app up to date in the background.
    registerSW({ immediate: true })
  }
  render()
})()
