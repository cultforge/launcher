# CultForge Windows release pipeline
# freeze → frontend build/test → signed tauri build → SHA256 + latest.json (MSI preferred)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$SemVer = "2.4.1"
$Display = "2.4.1"
$GitHubRepo = if ($env:CULTFORGE_GITHUB_REPO) { $env:CULTFORGE_GITHUB_REPO } else { "cultforge/launcher" }
$ApiFeedUrl = "https://api.cultforge.com/v1/launcher/updates/latest.json"
$ReleaseDir = Join-Path $Root "dist-release"
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

function Assert-Contains([string]$Path, [string]$Needle, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "Missing $Label at $Path" }
  $text = Get-Content -Raw $Path
  if ($text -notmatch [regex]::Escape($Needle)) {
    throw "$Label does not contain expected '$Needle' ($Path)"
  }
}

function Ensure-UpdaterSigning {
  if ($env:TAURI_SIGNING_PRIVATE_KEY) { return }
  $keyPath = $null
  if ($env:TAURI_SIGNING_PRIVATE_KEY_PATH -and (Test-Path $env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    $keyPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
  } else {
    $defaultKey = Join-Path $env:USERPROFILE ".tauri\cultforge.key"
    if (Test-Path $defaultKey) { $keyPath = $defaultKey }
  }
  if ($keyPath) {
    # Tauri bundler reliably reads TAURI_SIGNING_PRIVATE_KEY (contents), not always PATH.
    $env:TAURI_SIGNING_PRIVATE_KEY = [System.IO.File]::ReadAllText($keyPath).Trim()
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH -ErrorAction SilentlyContinue
    Write-Host "Loaded updater signing key from: $keyPath"
    return
  }
  throw @"
Updater signing key not found.
Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH, or place the key at:
  $(Join-Path $env:USERPROFILE '.tauri\cultforge.key')
See docs/launcher-updater.md
"@
}

function Resolve-Sig([string]$ArtifactPath) {
  $sig = "$ArtifactPath.sig"
  if (Test-Path $sig) { return $sig }
  return $null
}

Write-Host "== CultForge $Display release =="
Write-Host "Asserting version stamps..."

Assert-Contains (Join-Path $Root "package.json") "`"version`": `"$SemVer`"" "package.json"
Assert-Contains (Join-Path $Root "src-tauri\tauri.conf.json") "`"version`": `"$SemVer`"" "tauri.conf.json"
Assert-Contains (Join-Path $Root "src-tauri\Cargo.toml") "version = `"$SemVer`"" "Cargo.toml"
Assert-Contains (Join-Path $Root "client.py") "APP_VERSION = `"$SemVer`"" "client.py"
Assert-Contains (Join-Path $Root "src\manifest.tsx") "APP_VERSION = `"$Display`"" "manifest.tsx"

Ensure-UpdaterSigning

Write-Host "0/5 companions:fetch (scanner + client)..."
& node (Join-Path $Root "scripts\fetch-companions.mjs")
if ($LASTEXITCODE -ne 0) { throw "companions:fetch failed" }

Write-Host "1/5 sidecar:freeze..."
if ($env:CULTFORGE_SKIP_SIDECAR_FREEZE -eq "1") {
  Write-Host "Skipping sidecar freeze (CULTFORGE_SKIP_SIDECAR_FREEZE=1)"
} else {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\freeze-sidecar.ps1")
  if ($LASTEXITCODE -ne 0) { throw "sidecar:freeze failed" }
}

$Sidecar = Join-Path $Root "dist-sidecar\client.exe"
$RootClient = Join-Path $Root "client.exe"
$ResClient = Join-Path $Root "src-tauri\resources\client.exe"
foreach ($p in @($Sidecar, $RootClient, $ResClient)) {
  if (-not (Test-Path $p)) { throw "Expected client.exe missing: $p" }
}

Write-Host "2/5 npm run build..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

Write-Host "3/5 npm test..."
npm test
if ($LASTEXITCODE -ne 0) { throw "npm test failed" }

Write-Host "4/5 npm run tauri build (MSI preferred, then NSIS)..."
$env:TAURI_WIX_SKIP_MSI_VALIDATION = "true"
npm run tauri -- build --bundles msi
if ($LASTEXITCODE -ne 0) { throw "tauri MSI build failed" }

npm run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) {
  Write-Warning "NSIS bundle failed - MSI may still be shippable for updater."
}

$Msi = $null
$Nsis = $null
$MsiDir = Join-Path $Root "src-tauri\target\release\bundle\msi"
$NsisDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$MsiCand = Get-ChildItem $MsiDir -Filter "*${SemVer}*.msi" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($MsiCand) { $Msi = $MsiCand.FullName }
$NsisCand = Get-ChildItem $NsisDir -Filter "*${SemVer}*setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($NsisCand) { $Nsis = $NsisCand.FullName }

if (-not $Msi) { throw "MSI installer not found for $SemVer" }

$MsiName = Split-Path $Msi -Leaf
$MsiSig = Resolve-Sig $Msi
if (-not $MsiSig) {
  throw "Missing updater signature for MSI ($Msi.sig). Ensure createUpdaterArtifacts and signing key are set."
}

$UpdaterArtifact = $Msi
$UpdaterName = $MsiName
$UpdaterSig = $MsiSig
$UpdaterKind = "msi"

$SigText = (Get-Content -Raw $UpdaterSig).Trim()
$DownloadUrl = "https://github.com/$GitHubRepo/releases/download/v$SemVer/$UpdaterName"
$PubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$Latest = [ordered]@{
  version   = $SemVer
  notes     = "CultForge $Display"
  pub_date  = $PubDate
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $SigText
      url       = $DownloadUrl
    }
  }
}
$LatestPath = Join-Path $ReleaseDir "latest.json"
# UTF-8 without BOM - Tauri updater is picky about JSON encoding.
[System.IO.File]::WriteAllText(
  $LatestPath,
  ($Latest | ConvertTo-Json -Depth 6),
  [System.Text.UTF8Encoding]::new($false)
)

Copy-Item -Force $Msi (Join-Path $ReleaseDir $MsiName)
Copy-Item -Force $MsiSig (Join-Path $ReleaseDir "$MsiName.sig")
# latest.json is already written into $ReleaseDir — do not copy onto itself.

if ($Nsis) {
  $NsisName = Split-Path $Nsis -Leaf
  $NsisSig = Resolve-Sig $Nsis
  Copy-Item -Force $Nsis (Join-Path $ReleaseDir $NsisName)
  if ($NsisSig) {
    Copy-Item -Force $NsisSig (Join-Path $ReleaseDir "$NsisName.sig")
  }
}

Write-Host "5/5 writing checksums..."
function Sha256Of([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

$ManifestPath = Join-Path $ReleaseDir "RELEASE-$SemVer.txt"
$lines = @(
  "CultForge $Display",
  "semver=$SemVer",
  "built=$(Get-Date -Format o)",
  "github_repo=$GitHubRepo",
  "updater_artifact=$UpdaterKind",
  "updater_download=$DownloadUrl",
  "api_feed=$ApiFeedUrl",
  "github_feed=https://github.com/$GitHubRepo/releases/latest/download/latest.json",
  "",
  "SHA256 dist-sidecar/client.exe",
  (Sha256Of $Sidecar),
  "",
  "SHA256 MSI",
  $Msi,
  (Sha256Of $Msi),
  "",
  "SHA256 MSI.sig",
  $MsiSig,
  (Sha256Of $MsiSig),
  "",
  "Updater feed: $LatestPath"
)
if ($Nsis) {
  $lines += @(
    "",
    "SHA256 NSIS",
    $Nsis,
    (Sha256Of $Nsis)
  )
}
$lines += @(
  "",
  "GitHub Releases upload:",
  "  gh release create v$SemVer --repo $GitHubRepo --title `"CultForge $Display`" --notes `"CultForge $Display`" ``",
  "    `"$LatestPath`" ``",
  "    `"$(Join-Path $ReleaseDir $MsiName)`" ``",
  "    `"$(Join-Path $ReleaseDir "$MsiName.sig")`"",
  "",
  "API live channel: proxy $ApiFeedUrl → GitHub latest.json (see docs/launcher-updater.md).",
  "",
  "Smoke gate (manual):",
  "- Installed app auth + quiet sidecar log",
  "- Launcher updater via api then GitHub fallback",
  "- docs/admin-smoke-checklist.md",
  "- docs/launcher-updater.md"
)
$lines | Set-Content -Encoding utf8 $ManifestPath

Write-Host ""
Write-Host "Release artifacts ready:"
Write-Host "  $Msi"
Write-Host "  $MsiSig"
Write-Host "  $LatestPath"
if ($Nsis) { Write-Host "  $Nsis" }
Write-Host "  $ManifestPath"
Write-Host ""
Write-Host "Publish with:"
Write-Host "  gh release create v$SemVer --repo $GitHubRepo --title `"CultForge $Display`" --notes `"CultForge $Display`" ``"
Write-Host "    `"$LatestPath`" ``"
Write-Host "    `"$(Join-Path $ReleaseDir $MsiName)`" ``"
Write-Host "    `"$(Join-Path $ReleaseDir "$MsiName.sig")`""
Write-Host "Done."
