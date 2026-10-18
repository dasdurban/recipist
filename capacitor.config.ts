import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Wraps the built web app for iOS, iPadOS and Android.
 * Run `npm run build && npx cap sync` after changing this file.
 */
const config: CapacitorConfig = {
  appId: 'com.recipist.app',
  appName: 'The Recipe App',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
  server: {
    // Set a LAN url here only during live-reload development.
    // url: 'http://192.168.1.10:5173',
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    Camera: {
      // Photos are read on-device and never uploaded by the app itself.
      presentationStyle: 'popover',
    },
  },
}

export default config
