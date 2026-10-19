import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { TimerWindow } from './components/TimerWindow'
import { isTimerWindow } from './lib/native'
import { initTimerSync } from './lib/timerSync'
import { applyTimerSnapshot, timerSnapshot } from './store/useApp'
import './index.css'

// On the desktop the timer can live in a window of its own. That window runs
// the same bundle but shows only the dial, and the two windows keep each other
// in step (see lib/timerSync).
const timerOnly = isTimerWindow()
initTimerSync(applyTimerSnapshot, timerSnapshot, timerOnly)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{timerOnly ? <TimerWindow /> : <App />}</React.StrictMode>,
)

// Keep the installed app up to date in the background.
registerSW({ immediate: true })
