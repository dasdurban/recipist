# Privacy Policy — The Recipe App

**Last updated: 19 October 2026**

The Recipe App ("the app") is a personal recipe organiser. This policy explains
what information the app handles, where it goes, and what control you have over
it.

The short version: **your recipes stay on your device.** The app has no accounts,
no analytics, no advertising, and no servers of ours that receive your data. The
only time information leaves your device is when *you* ask it to — importing a
recipe from a website, or syncing to storage you set up yourself.

## Who we are

The Recipe App is developed and published by **Victor ("we", "us")**. For any
question about this policy or your data, contact:

**dasleveille@gmail.com**

## Information the app handles

### Recipes and notes you create or import

Recipes, ingredients, instructions, categories, shopping lists, event plans,
photos and any notes you add are stored **locally on your device** in the app's
own storage area. This includes:

- recipes you type in yourself;
- recipes imported from a website URL you paste;
- photos you import, including any text extracted from them.

This information is **not sent to us**, and we cannot see it. We operate no
server that receives your recipes.

### Photos

If you import a photo (for example, a photograph of a recipe card), the image is
saved with the recipe on your device. Text is extracted from the image
**on your device** to help fill in the recipe. The photo is not uploaded to us.

### Settings

Your preferences — theme, colours, layout, proxy settings, sync configuration —
are stored locally on your device alongside your recipes.

### Sync credentials (only if you enable sync)

If you turn on sync, you choose a storage provider and enter **your own**
credentials for it (for example, a WebDAV server address, username and password,
or OAuth client details). Those credentials are stored on your device and are
used only to connect to the provider **you** named. They are not sent to us.

### What we do *not* collect

We do not collect, and the app does not contain:

- any analytics or usage tracking;
- any crash reporting or telemetry;
- any advertising or advertising identifiers;
- any device fingerprinting;
- any account, email address, name or sign-in of any kind;
- any location data;
- any contact list, calendar or health data.

We have no way to identify you, and we do not attempt to.

## When information leaves your device

There are exactly three situations, all of them started by you.

### 1. Importing a recipe from a website

When you paste a recipe URL and choose to import it, the app requests that page
from the website in question. To make this work, the app may route the request
through a **CORS proxy** — a service that fetches the page on your behalf. By
default the app uses one of these public proxies:

- `api.allorigins.win`
- `api.codetabs.com`
- `corsproxy.io`
- `api.cors.lol`

You can replace this in **Settings** with your own proxy. Whatever URL you are
importing is visible to whichever proxy is in use, so choose one you are
comfortable with — or configure your own.

The recipe page itself is fetched from the website you named, so that website
sees a request from you in the ordinary way, as any browser visit would.

### 2. Sync, if you turn it on

If you enable sync, your recipes are copied to the storage provider **you**
configured — for example your own WebDAV server, or iCloud, OneDrive, Google
Drive or Dropbox. That provider's own privacy policy governs what it does with
the data. We are not involved in, and cannot see, that transfer.

Sync is **off by default**.

### 3. Fetching supporting resources

Some optional features download supporting files:

- **Text recognition (OCR)** uses the Tesseract engine, whose worker files and
  language data are downloaded from a public content delivery network the first
  time you use the feature.

These downloads request only the resource itself. No content of yours is sent
with them.

## How your information is stored and secured

Your data is stored in your device's standard application storage area, which is
protected by your operating system's normal file protections and by any disk
encryption you use.

If you enable sync, data in transit to your provider is protected by that
provider's transport security (HTTPS/TLS).

We hold no copy of your data, so there is nothing for us to secure, breach or
lose on your behalf.

## How long information is kept

Your data stays on your device **until you delete it**. Deleting a recipe,
category or photo removes it from local storage. Uninstalling the app removes
its local data too, subject to your platform's behaviour.

Because we hold nothing, there is no retention period on our side.

## Your control over your information

- **Access and export** — the app includes a backup feature that exports your
  data to a file you control. There is also no lock-in: what you export is yours.
- **Correction** — edit anything directly in the app.
- **Deletion** — delete individual recipes, photos or categories, or uninstall
  the app to remove everything.
- **Withdrawal of sync** — turn sync off at any time; a copy may remain with the
  provider you configured until you delete it there.

Requests about data we hold are not meaningful, because we hold none. If you
think we do, contact us at the address above.

## Children

The app is not directed at children and collects no personal information from
anyone, including children.

## Changes to this policy

If this policy changes, we will update the date at the top. Material changes
will be noted in the app's release notes.

## Disclosure to third parties

We do not sell, rent, trade or share your information, because we do not have
it. The only third parties that ever receive anything are the ones described
above, and only because you asked the app to contact them:

| Recipient | What it receives | When |
|---|---|---|
| The recipe website you import from | Your request for that page | When you import a URL |
| The CORS proxy in use | The URL you are importing | When you import a URL |
| Your chosen sync provider | Your recipes | Only if you enable sync |
| Public CDN | A request for OCR engine files | First time you use OCR |

## Contact

**dasleveille@gmail.com**

---

*This policy describes The Recipe App as distributed through the Mac App Store
and the Microsoft Store, and as the direct-download version.*
