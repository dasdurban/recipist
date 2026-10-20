# Assembles an MSIX package for the Microsoft Store.
#
# Tauri cannot emit MSIX, so this stages the built Windows app into a folder
# laid out the way a package expects, generates the tile assets the manifest
# references, substitutes the Partner Center identity values, and runs
# MakeAppx.exe over the result.
#
# Two modes:
#
#   -Register   stage only, then register the folder with the current user.
#               This is how the package is tested locally: no certificate is
#               needed, and the Store has not signed anything yet. Requires
#               Developer Mode.
#
#   -Package    stage, then produce a .msix with MakeAppx.
#
# Usage:
#   pwsh scripts/build-msix.ps1 -Register
#   pwsh scripts/build-msix.ps1 -Package
#
# Run on Windows, after `npx tauri build` has produced the release binary.

[CmdletBinding()]
param(
  [switch]$Register,
  [switch]$Package,
  [string]$Configuration = "release",
  # MakeAppx.exe to use. Defaults to PATH, but CI passes the full path from the
  # Windows SDK because GITHUB_PATH only affects later steps, not the step that
  # sets it.
  [string]$MakeAppxPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$srcTauri = Join-Path $repoRoot "src-tauri"
$msixDir = Join-Path $srcTauri "msix"
$identityFile = Join-Path $msixDir "identity.json"

$binary = Join-Path $srcTauri "target\$Configuration\recipist.exe"
$staging = Join-Path $srcTauri "target\msix\staging"
$outputDir = Join-Path $srcTauri "target\msix"

if (-not $Register -and -not $Package) {
  Write-Error "Nothing to do. Pass -Register (for local testing) or -Package (to build a .msix)."
}

# --- preflight -------------------------------------------------------------

if (-not (Test-Path $binary)) {
  Write-Error "No release binary at $binary. Run 'npx tauri build' first."
}

if (-not (Test-Path $identityFile)) {
  Write-Error "Missing $identityFile. Copy identity.example.json and fill in the values from Partner Center (Product management > App identity)."
}

$identity = Get-Content $identityFile -Raw | ConvertFrom-Json

foreach ($field in @("identityName", "identityPublisher", "publisherDisplayName")) {
  if ([string]::IsNullOrWhiteSpace($identity.$field)) {
    Write-Error "identity.json is missing '$field'. Get it from Partner Center > Product management > App identity."
  }
}

# Version must be quad notation, and the Store reserves the fourth field.
$version = (Get-Content (Join-Path $srcTauri "tauri.conf.json") -Raw | ConvertFrom-Json).version
$quad = if (($version -split "\.").Count -eq 3) { "$version.0" } else { $version }
if ($quad -notmatch '^\d+\.\d+\.\d+\.\d+$') {
  Write-Error "Version '$quad' is not major.minor.build.revision."
}

# Resolve MakeAppx to a full path. An explicit path wins; otherwise look on PATH.
$makeAppxExe = ""
if (-not [string]::IsNullOrWhiteSpace($MakeAppxPath)) {
  if (Test-Path $MakeAppxPath) { $makeAppxExe = (Resolve-Path $MakeAppxPath).Path }
} else {
  $found = Get-Command MakeAppx.exe -ErrorAction SilentlyContinue
  if ($found) { $makeAppxExe = $found.Source }
}

if ($Package -and [string]::IsNullOrWhiteSpace($makeAppxExe)) {
  Write-Error "MakeAppx.exe not found. Install the Windows SDK (the 'MSIX Packaging Tools' component) and either run this from a Developer PowerShell, or pass -MakeAppxPath."
}

# --- stage -----------------------------------------------------------------

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Write-Host "Staging the app into $staging"
Copy-Item $binary (Join-Path $staging "recipist.exe")

# Everything the app needs to run sits next to the exe. The release bundle has
# no side-by-side DLLs of its own (WebView2 is a system component), but copy
# any that appear so a future dependency is not silently left behind.
#
# Debug symbols are deliberately excluded. They serve no purpose in a shipped
# package, and a release build does emit a .pdb next to the binary.
Get-ChildItem (Split-Path $binary) -File |
  Where-Object { $_.Extension -in ".dll", ".json" -and $_.Name -ne "recipist.exe" } |
  ForEach-Object { Copy-Item $_.FullName $staging }

# --- assets ----------------------------------------------------------------

$assets = Join-Path $staging "Assets"
New-Item -ItemType Directory -Path $assets -Force | Out-Null

# The manifest references these by name. Tauri's icon set already contains the
# right sizes under src-tauri/icons.
$iconMap = @{
  "StoreLogo.png"         = "StoreLogo.png"
  "Square150x150Logo.png" = "Square150x150Logo.png"
  "Square44x44Logo.png"   = "Square44x44Logo.png"
  "Square71x71Logo.png"   = "Square71x71Logo.png"
  "Square310x310Logo.png" = "Square310x310Logo.png"
}

foreach ($target in $iconMap.Keys) {
  $source = Join-Path $srcTauri "icons\$($iconMap[$target])"
  if (-not (Test-Path $source)) {
    Write-Error "Missing tile asset $source. Regenerate the icon set with 'npx tauri icon'."
  }
  Copy-Item $source (Join-Path $assets $target)
}

# A wide tile is not in Tauri's default set. Build one from the square logo if
# it is absent, so the manifest reference is always satisfied.
$wideTile = Join-Path $assets "Wide310x150Logo.png"
if (-not (Test-Path $wideTile)) {
  $square = Join-Path $srcTauri "icons\Square310x310Logo.png"
  Add-Type -AssemblyName System.Drawing
  $image = [System.Drawing.Image]::FromFile($square)
  try {
    $bitmap = New-Object System.Drawing.Bitmap 310, 150
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    # Keep the mark square and centred in the wide tile.
    $size = 130
    $x = [int]((310 - $size) / 2)
    $y = [int]((150 - $size) / 2)
    $graphics.DrawImage($image, $x, $y, $size, $size)
    $bitmap.Save($wideTile, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Host "Generated Wide310x150Logo.png from the square logo"
  } finally {
    $image.Dispose()
  }
}

# --- manifest --------------------------------------------------------------

$manifestTemplate = Join-Path $msixDir "AppxManifest.xml"
$manifest = Get-Content $manifestTemplate -Raw
$manifest = $manifest.Replace("{{IDENTITY_NAME}}", $identity.identityName)
$manifest = $manifest.Replace("{{IDENTITY_PUBLISHER}}", $identity.identityPublisher)
$manifest = $manifest.Replace("{{IDENTITY_VERSION}}", $quad)
$manifest = $manifest.Replace("{{PUBLISHER_DISPLAY_NAME}}", $identity.publisherDisplayName)

if ($manifest -match "\{\{[A-Z_]+\}\}") {
  Write-Error "AppxManifest.xml still contains unsubstituted placeholders."
}

# Write without a BOM. PowerShell 5.1's "Set-Content -Encoding UTF8" emits one,
# and MakeAppx rejects a manifest that does not start at byte zero.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $staging "AppxManifest.xml"), $manifest, $utf8NoBom)

Write-Host "Manifest identity: $($identity.identityName) $quad"

# --- register (test) or package (submit) -----------------------------------

if ($Register) {
  Write-Host ""
  Write-Host "Registering the staging folder with the current user."
  Write-Host "No certificate is needed, but Developer Mode must be on."
  Write-Host "(Settings > System > For developers)"
  Write-Host ""
  Add-AppxPackage -Register (Join-Path $staging "AppxManifest.xml")
  Write-Host "Registered. Launch it from the Start menu."
  Write-Host "To remove it again:  Get-AppxPackage $($identity.identityName) | Remove-AppxPackage"
  exit 0
}

$msixPath = Join-Path $outputDir "TheRecipeApp_${quad}_x64.msix"
Write-Host ""
Write-Host "Packing with MakeAppx..."
& $makeAppxExe pack /d $staging /p $msixPath /o
if ($LASTEXITCODE -ne 0) { Write-Error "MakeAppx failed." }

$size = [math]::Round((Get-Item $msixPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Built $msixPath ($size MB)"
Write-Host ""
Write-Host "This package is unsigned. That is correct for the Store: Microsoft"
Write-Host "re-signs MSIX submissions during publishing, so no CA certificate is"
Write-Host "needed. Upload this file to the Packages page in Partner Center."
