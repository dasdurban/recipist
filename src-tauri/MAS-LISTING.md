# Mac App Store listing

Everything App Store Connect asks for, written to be pasted or copied from.
Paired with `src-tauri/MAS-READINESS.md`, which covers the build side.

## The app record

| Field | Value |
| --- | --- |
| App name | **Tomato - The Recipe App** |
| Bundle ID | `com.recipist.app` |
| SKU | `recipist-001` (any unique string; not shown to users) |
| Primary language | English (U.S.) |
| Primary category | Food & Drink |
| Secondary category | Lifestyle (optional; leave empty if unsure) |
| Content rights | Does not contain third-party content |
| Age rating | 4+ (see the questionnaire below) |
| Price | Free |

The SKU is internal only. It cannot be changed after the record is created, but
nothing user-visible depends on it.

### Why the app name is "Tomato - The Recipe App"

"The Recipe App" was already taken in App Store Connect, so the record carries
the hyphenated name above. Apple's uniqueness rule applies to the **store
listing** name, not to the bundle name, so nothing in the build has to change to
satisfy it.

That leaves a deliberate mismatch worth understanding rather than discovering at
review:

| Where | Reads |
| --- | --- |
| App Store listing, search results | Tomato - The Recipe App |
| Installed app: Dock, Launchpad, app menu, sidebar | The Recipe App |

This is permitted — the store name may carry a qualifier that the installed name
omits — but both must still be recognisably the same app. "Tomato" as a leading
qualifier reads as a brand prefix, which is the accepted pattern; a name that
looked unrelated to the installed app would invite a question under Guideline
2.3.8 (accurate metadata).

**If the mismatch is ever questioned**, the cheap fix is to make the two agree:
set `bundle.macOS` `CFBundleDisplayName` to `Tomato - The Recipe App`, or rename
the in-app strings. The one thing that must **not** change is the bundle
identifier `com.recipist.app` — it is fixed to the App Store Connect record and
to the provisioning profile, and changing it means a new record and a new app.

## Subtitle

Thirty characters maximum, shown under the app name in search results.

```
Your recipes, sorted and saved
```

That is exactly 30 characters. It fits, but with no margin, so swap in a
shorter variant if the field ever complains:

```
Your recipes, saved
```

## Promotional text

One hundred and seventy characters, editable without a new review. Useful for
noting a release without resubmitting.

```
A local-first recipe box. Import from any cooking site, plan meals, build shopping lists, and keep everything on your own machine.
```

## Description

```
Tomato keeps your recipes in one place and gets out of the way.

Import a recipe from a cooking website and it arrives readable: ingredients,
steps, times, and a photo, with the clutter stripped out. Scan a page or a
recipe card and the text is picked up automatically. Anything you add by hand
takes a few seconds.

Organise by category, favourite the ones you cook often, and search across
everything.

Plan events and the app builds the shopping list for you, combining what
several recipes need and letting you tick items off as you go.

A few things worth knowing:

- Everything is stored on your own machine. There is no account, no sign-in,
  and no recipe database belonging to us.
- Nothing is collected about you. No analytics, no advertising, no tracking.
- Viewing, searching, printing, and exporting all work offline. The app reaches
  the network only when you ask it to fetch a page, and once at first use of
  photo scanning, which downloads a language model.
- Printing is clean: the recipe, the steps, and nothing else.
- Optional sync to a storage provider you already use, with your own
  credentials, if you want the same recipes on more than one machine.

A kitchen timer is built in, and opens in its own window so it stays visible
while you cook.
```

Notes on the description, so it does not drift into a rejection:

- It claims no data collection, which matches `PrivacyInfo.xcprivacy`. Do not
  add a sentence about "improving the app" or "anonymous usage data" without
  changing the manifest too.
- The sync line says "a storage provider you already use", because the app
  does not operate a sync service. Keep it that way.
- No competitor names, no price claims, no "best".

## Keywords

One hundred characters maximum, comma separated, no spaces after commas. Do not
repeat the app name, and do not repeat words already in the subtitle, since
both are indexed.

```
recipe,meal plan,cookbook,grocery list,shopping,ingredients,kitchen,cooking
```

## URLs

| Field | Value |
| --- | --- |
| Support URL | `https://github.com/dasdurban/recipist/issues` |
| Marketing URL | `https://github.com/dasdurban/recipist` |
| Privacy policy URL | `https://dasdurban.github.io/recipist/privacy-policy.html` |

A privacy policy URL is **mandatory** even though the app collects nothing.
The support URL must reach a page where a user can get help — the issues page
qualifies; a bare repository page is weaker, so keep the issues link.

## Age rating questionnaire

A recipe app is 4+ with no exceptions likely. Answer as follows.

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Sexual content or nudity | None |
| Profanity or crude humour | None |
| Alcohol, tobacco, or drug use | None |
| Mature or suggestive themes | None |
| Horror or fear themes | None |
| Medical or treatment information | None |
| Gambling | None |
| Unrestricted web access | **No** |

The last one matters. The app fetches pages the user names, but it does not
present an open browser, so it is not unrestricted web access. Answering **Yes**
would force a 17+ rating.

## Screenshots

Mac App Store screenshots are **different** from the Microsoft Store ones. Apple
accepts exactly four pixel sizes and rejects anything else:

```
1280 x 800      1440 x 900      2560 x 1600      2880 x 1800
```

All four are the same 16:10 shape. At least one is required; up to 10 per
display size.

**Make 2880 x 1800** unless there is a reason not to. It is the largest on the
list and exactly twice 1440 x 900, so a set made at that size also exports
cleanly at half size. Apple has no stated colour space or file-size limit.

Rules that catch people out:

- PNG or JPEG, **no alpha channel**, at 72 dpi.
- 16:10 aspect ratio only. A 16:9 or square image is rejected.
- Almost nothing you capture comes out at one of these sizes: a window is
  whatever size it was left at, and most current Mac screens have a notch that
  makes them 16:10.35 rather than 16:10. Expect to crop, not just scale.

Capture the same four views as the Microsoft Store listing, since they are the
views worth showing: home grid, a recipe open, the event planner, and a
shopping list. See `scripts/capture-screenshots.sh`.

Two practical notes:

- **Fill the app with real recipes first.** A single example recipe makes a
  thin screenshot, and the grid is the image people judge the app by.
- **A Retina capture is 2x the point size.** A 1440x900 window captured on a
  Retina display produces 2880x1800 — exactly an accepted size. Do not
  downscale it.

## App privacy (the Data Collection form)

This must agree with `PrivacyInfo.xcprivacy`. Answer **"No, we do not collect
data from this app"**.

That is accurate and defensible: the developer operates no server that receives
user data, and nothing leaves the device except content the user themselves
chose to send to a provider they configured. The privacy manifest declares
three data types, all marked `Linked: false` and `Tracking: false`, because
Apple's taxonomy describes data that is *handled* rather than data that is
*collected by the developer*.

If App Store Connect pushes back, the manifest and the form are describing the
same behaviour, and the honest answer is unchanged.

## Export compliance

Asked on every submission. The app uses HTTPS, so:

| Question | Answer |
| --- | --- |
| Does your app use encryption? | Yes |
| Does it use only standard encryption, or is it exempt? | **Yes** — it uses HTTPS through the system frameworks |
| Does it use proprietary or non-standard encryption? | No |

This matters: answering it correctly avoids an annual self-classification
report to the US government. The app implements no cryptography of its own; it
calls the platform's TLS.

## Review notes

Paste this into the Notes field. Reviewers reject apps that cannot be exercised
without an account, so saying up front that there is no account saves a round
trip.

```
There is no account, sign-in, or subscription, so nothing is needed to test
the app.

Suggested path:
1. The app opens on the recipe library with one example recipe.
2. Tap "Import" and paste any recipe URL to see the importer.
3. Tap "New" to add a recipe by hand.
4. Tap a recipe to open it, then Print.
5. Open "Event planner", create an event, and add a recipe to see the
   shopping list it generates.

The app stores everything locally and makes no network request unless the user
imports a URL or enables sync.
```

## Before submitting

- [ ] Screenshots captured at an accepted size, with real recipes in them
- [ ] `scripts/build-mas.sh` completed on a machine with Xcode and the Apple
      Distribution certificate
- [ ] The signed `.app` uploaded with Transporter or `xcrun altool`
- [ ] The build appears as "Processing" then ready in App Store Connect
- [ ] Privacy answers entered and matching `PrivacyInfo.xcprivacy`
- [ ] Export compliance answered
- [ ] Review notes pasted
