# Microsoft Store submission

Everything needed to publish The Recipe App to the Microsoft Store, and where
each piece lives.

## Where things stand

| Step | State |
| --- | --- |
| Developer account | Done — app name "The Recipe App" reserved |
| WebView2 installed offline | Done — `bundle.windows.webviewInstallMode: offlineInstaller` |
| Package manifest | Done — `src-tauri/msix/AppxManifest.xml` |
| Packaging script | Done — `scripts/build-msix.ps1` |
| Identity values | Done — held in repository variables, not committed |
| Package built automatically | Done — the Windows CI job emits `windows-store-msix` |
| Local test on Windows | **Needed** — `-Register` mode, no certificate |
| Submit | **Needed** — upload the `.msix` to Partner Center |

## Why MSIX and not the MSI

The Store accepts both, but re-signs only MSIX:

> Your MSIX and AppX packages don't have to be signed with a certificate rooted
> in a trusted certificate authority when submitting to the Microsoft Store.
> The Microsoft Store will automatically re-sign your MSIX/AppX packages.
>
> If you are submitting an MSI or EXE installer to the Store, the Store does
> not re-sign those files. You must Authenticode-sign your MSI/EXE installer
> yourself with a valid code signing certificate.

A CA-trusted code-signing certificate costs a few hundred dollars a year and
now requires a hardware token or HSM. MSIX avoids that expense entirely, which
is the whole reason for taking this route.

## The offline installer requirement

Both routes require an offline installer — "no downloads during setup".

Tauri's default, `downloadBootstrapper`, fetches WebView2 from
`go.microsoft.com` while installing. That is visible in the MSI as a
`DownloadAndInvokeBootstrapper` custom action and disqualifies the package.

`bundle.windows.webviewInstallMode` is therefore set to `offlineInstaller`.
Tauri downloads the Evergreen standalone runtime once **at build time** and
embeds it, so setup needs no network. The cost is real: the installers grew
from ~4 MB to ~209 MB.

Check any installer with:

```
scripts/check-offline-installer.sh <installer>
```

It fails if it finds the download markers, and passes if it finds the embedded
runtime.

## One-time setup: the identity values

The manifest must carry the exact identity Microsoft issued for the reserved
name. Guessing these produces a package that fails validation.

1. Go to [Partner Center](https://partner.microsoft.com/dashboard).
2. Open the app, then **Product management → App identity**.
3. Copy the values into `src-tauri/msix/identity.json`
   (copy `identity.example.json` and fill it in).

Values are **case-sensitive**, and spaces and punctuation must match exactly.
`identityPublisher` must equal the subject of the certificate Microsoft uses
when re-signing, so copy the string verbatim.

`identity.json` is gitignored because it is account-specific. The repository is
public, so keep it out of commits.

### Where CI gets them

The committed workflow cannot read a gitignored file, so the Windows job takes
the identity from repository **variables** and writes `identity.json` itself:

| Variable | Value |
| --- | --- |
| `MSIX_IDENTITY_NAME` | `LeveilleApps.TheRecipeApp` |
| `MSIX_IDENTITY_PUBLISHER` | `CN=9E4DEF0B-55B5-49CC-9745-FEB62EB67D55` |
| `MSIX_PUBLISHER_DISPLAY_NAME` | `Leveille Apps` |

These are already set. Variables rather than secrets is deliberate: they are
not confidential, and variables are readable back, which makes a typo
diagnosable. A package built with a wrong publisher fails at submission, not at
build time, so being able to compare the values against Partner Center matters.

If the variables are absent, the step warns and skips rather than failing, so a
fork or a fresh clone still builds.

### Getting the package from CI

Every Windows build attaches it as its own artifact, separate from the 418 MB
installer bundle:

```
windows-store-msix   →   TheRecipeApp_0.1.0.0_x64.msix
```

Download it from the run's summary page and upload it to Partner Center. This
is the normal route; the PowerShell script is only needed for local testing.

The package is around 6 MB: the app binary plus the six tile assets. Debug
symbols are deliberately not staged.

### If the Windows job never starts

During setup, several Windows jobs sat in the queue for ~15 minutes and were
then cancelled, with no runner ever assigned (`runner_name` empty) and no steps
recorded. The Linux job in the same run was unaffected, and GitHub reported no
incident.

Re-running the failed jobs (`gh run rerun <id> --failed`) fixed it, and the
packaging then succeeded. It was transient runner allocation, not a workflow
problem — so if it recurs, rerun rather than editing the workflow.

## Local testing: no certificate needed

Developer Mode must be on (Settings → System → For developers).

On Windows, after a build:

```powershell
npx tauri build
pwsh scripts/build-msix.ps1 -Register
```

`-Register` stages the app, generates the tile assets, and registers the folder
with the current user via `Add-AppxPackage`. The app then launches from the
Start menu, packaged, without anything being signed.

To remove it again:

```powershell
Get-AppxPackage 1234Publisher.TheRecipeApp | Remove-AppxPackage
```

This is the cheapest way to catch a manifest or staging mistake, so do it
before producing a package.

## Producing the package to upload

```powershell
npx tauri build
pwsh scripts/build-msix.ps1 -Package
```

This requires `MakeAppx.exe`, from the Windows SDK (the "MSIX Packaging
Tools" component), so run it from a Developer PowerShell — or pass the path
explicitly with `-MakeAppxPath`:

```powershell
pwsh scripts/build-msix.ps1 -Package -MakeAppxPath "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\MakeAppx.exe"
```

Output:

```
src-tauri/target/msix/TheRecipeApp_0.1.0.0_x64.msix
```

The package is intentionally unsigned. Upload that file to the **Packages**
page in Partner Center; Microsoft signs it during publishing.

## Submission checklist

Partner Center walks through these; the ones that need thought are marked.

| Section | Notes |
| --- | --- |
| Pricing and availability | Free, all markets |
| Properties | Category, and the privacy policy URL: `https://dasdurban.github.io/recipist/privacy-policy.html` |
| Age ratings | Questionnaire |
| Packages | Upload the `.msix` |
| Store listings | Description, and **at least one screenshot — four recommended** |
| Submission options | Declare the restricted capability `runFullTrust` |

Minimum OS is Windows 10 2004 (10.0.19041.0). That floor comes from the
manifest using `uap10:RuntimeBehavior` and `uap10:TrustLevel`, which Microsoft
introduced in that release; older builds would need the legacy `EntryPoint`
attribute instead. 2004 is well past end of support, so this costs nothing.

The `runFullTrust` capability is a restricted capability, so the submission has
to declare it and probably justify it. For a packaged Win32 app this is
routine: the app is a normal desktop program, not a sandboxed UWP app.

## Screenshots

Still outstanding, and the last listing asset with no substitute for real
images. Partner Center requires at least one and recommends four.

Rules: PNG or JPEG, at least **1366x768**, at most 3840x2160, up to 10 images,
and no more than 50 MB each.

Capture the four views below from a normal window, not a phone-shaped one:

1. **Home** — the recipe grid, with the health badges visible in the card meta
   row. This is the shot that reads as the product.
2. **A recipe open** — the preview pane, showing ingredients and steps.
3. **Event planner** — an event with a few recipes attached, so the planning
   idea is obvious.
4. **Shopping list** — with some items checked, showing "everything needed".

Two things worth doing first, both of which make the shots more convincing:

- **Populate real-looking recipes.** One example recipe is thin; the grid shot
  is the one people judge the app by. Import a handful of genuine pages with
  the importer, which also demonstrates that it works.
- **Avoid personal data.** Screenshots are public, so do not use a list that
  shows real names, addresses or delivery details.

Note that the desktop build stores everything in IndexedDB locally, so the app
can be filled with sample content without any of it leaving the machine.

`scripts/capture-screenshots.sh` records the filenames and constraints.

## Data location, and upgrading from the MSI

MSIX installs into a container, so `%LOCALAPPDATA%` is redirected to the
package's private store. Recipes live in IndexedDB under that path, which means:

**A user moving from the MSI build to the Store build appears to lose their
recipes.** The data is still on disk, but at the pre-package location, and the
packaged app cannot see it.

The intended answer is a fresh start, using the app's existing backup and
export: export from the MSI build, import into the Store build. The same issue
exists on macOS with the App Store sandbox, and gets the same treatment.

Worth deciding before launch, since it affects what you tell early users.

## Files

| Path | Purpose |
| --- | --- |
| `src-tauri/msix/AppxManifest.xml` | Package manifest, with identity placeholders |
| `src-tauri/msix/identity.example.json` | Shape of the Partner Center values |
| `src-tauri/msix/identity.json` | Your real values (gitignored) |
| `scripts/build-msix.ps1` | Stages, then registers or packs |
| `scripts/check-offline-installer.sh` | Proves WebView2 is embedded |
