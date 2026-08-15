# CultForge Windows release pipeline
# freeze → frontend build/test → signed tauri build → SHA256 + latest.json
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$SemVer = "2.4.0"
$Display = "2.4 Generation 2"
$GitHubRepo = if ($env:CULTFORGE_GITHUB_REPO) { $env:CULTFORGE_GITHUB_REPO } else { "cultforge/launcher" }
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
  if ($env:TAURI_SIGNING_PRIVATE_KEY_PATH -and (Test-Path $env:TAURI_SIGNING_PRIVATE_KEY_PATH)) { return }
  $defaultKey = Join-Path $env:USERPROFILE ".tauri\cultforge.key"
  if (Test-Path $defaultKey) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $defaultKey
    Write-Host "Using updater signing key: $defaultKey"
    return
  }
  throw @"
Updater signing key not found.
Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH, or place the key at:
  $defaultKey
See docs/launcher-updater.md
"@
}

Write-Host "== CultForge $Display release =="
Write-Host "Asserting version stamps…"

Assert-Contains (Join-Path $Root "package.json") "`"version`": `"$SemVer`"" "package.json"
Assert-Contains (Join-Path $Root "src-tauri\tauri.conf.json") "`"version`": `"$SemVer`"" "tauri.conf.json"
Assert-Contains (Join-Path $Root "src-tauri\Cargo.toml") "version = `"$SemVer`"" "Cargo.toml"
Assert-Contains (Join-Path $Root "client.py") "APP_VERSION = `"$SemVer`"" "client.py"
Assert-Contains (Join-Path $Root "src\manifest.tsx") "APP_VERSION = `"$Display`"" "manifest.tsx"

Ensure-UpdaterSigning

Write-Host "1/5 sidecar:freeze…"
& powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\freeze-sidecar.ps1")
if ($LASTEXITCODE -ne 0) { throw "sidecar:freeze failed" }

$Sidecar = Join-Path $Root "dist-sidecar\client.exe"
$RootClient = Join-Path $Root "client.exe"
$ResClient = Join-Path $Root "src-tauri\resources\client.exe"
foreach ($p in @($Sidecar, $RootClient, $ResClient)) {
  if (-not (Test-Path $p)) { throw "Expected client.exe missing: $p" }
}

Write-Host "2/5 npm run build…"
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

Write-Host "3/5 npm test…"
npm test
if ($LASTEXITCODE -ne 0) { throw "npm test failed" }

Write-Host "4/5 npm run tauri build (NSIS, then MSI)…"
# NSIS first — primary ship + in-app updater artifact.
npm run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw "tauri NSIS build failed" }

$MsiOk = $true
# Skip ICE validation as a safety net; main.wxs uses single-package authoring to avoid ICE38.
$env:TAURI_WIX_SKIP_MSI_VALIDATION = "true"
npm run tauri -- build --bundles msi
if ($LASTEXITCODE -ne 0) {
  Write-Warning "MSI bundle failed (WiX light.exe). NSIS is still shippable."
  $MsiOk = $false
}

$Nsis = $null
$Msi = $null
$NsisDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$MsiDir = Join-Path $Root "src-tauri\target\release\bundle\msi"
$NsisCand = Get-ChildItem $NsisDir -Filter "*${SemVer}*setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($NsisCand) { $Nsis = $NsisCand.FullName }
if ($MsiOk) {
  $MsiCand = Get-ChildItem $MsiDir -Filter "*${SemVer}*.msi" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($MsiCand) { $Msi = $MsiCand.FullName }
}

if (-not $Nsis) { throw "NSIS installer not found for $SemVer" }

$NsisName = Split-Path $Nsis -Leaf
$NsisSig = "$Nsis.sig"
if (-not (Test-Path $NsisSig)) {
  # Some Tauri versions emit signature beside the installer with the same stem.
  $altSig = Join-Path $NsisDir ($NsisName -replace '\.exe$', '.exe.sig')
  if (Test-Path $altSig) { $NsisSig = $altSig }
}
if (-not (Test-Path $NsisSig)) {
  throw "Missing updater signature for NSIS ($Nsis.sig). Ensure createUpdaterArtifacts and signing key are set."
}

$SigText = (Get-Content -Raw $NsisSig).Trim()
$DownloadUrl = "https://github.com/$GitHubRepo/releases/download/v$SemVer/$NsisName"
$PubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$Latest = [ordered]@{
  version  = $SemVer
  notes    = "CultForge $Display"
  pub_date = $PubDate
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $SigText
      url       = $DownloadUrl
    }
  }
}
$LatestPath = Join-Path $ReleaseDir "latest.json"
$Latest | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $LatestPath

Copy-Item -Force $Nsis (Join-Path $ReleaseDir $NsisName)
Copy-Item -Force $NsisSig (Join-Path $ReleaseDir "$NsisName.sig")

Write-Host "5/5 writing checksums…"
function Sha256Of([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

$ManifestPath = Join-Path $ReleaseDir "RELEASE-$SemVer.txt"
$lines = @(
  "CultForge $Display",
  "semver=$SemVer",
  "built=$(Get-Date -Format o)",
  "github_repo=$GitHubRepo",
  "updater_url=$DownloadUrl",
  "",
  "SHA256 dist-sidecar/client.exe",
  (Sha256Of $Sidecar),
  "",
  "SHA256 NSIS",
  $Nsis,
  (Sha256Of $Nsis),
  "",
  "SHA256 NSIS.sig",
  $NsisSig,
  (Sha256Of $NsisSig),
  "",
  "Updater feed: $LatestPath"
)
if ($Msi) {
  $lines += @(
    "",
    "SHA256 MSI",
    $Msi,
    (Sha256Of $Msi)
  )
} else {
  $lines += @(
    "",
    "MSI: not produced (WiX light.exe failed — ship NSIS)"
  )
}
$lines += @(
  "",
  "GitHub Releases upload (updater):",
  "  gh release create v$SemVer --repo $GitHubRepo --title `"CultForge $Display`" --notes `"CultForge $Display`" ``",
  "    `"$LatestPath`" ``",
  "    `"$(Join-Path $ReleaseDir $NsisName)`" ``",
  "    `"$(Join-Path $ReleaseDir "$NsisName.sig")`"",
  "  (Attach MSI separately if shipping; in-app updater uses NSIS + latest.json only.)",
  "",
  "Smoke gate (manual):",
  "- Installed app auth + quiet sidecar log",
  "- Guild build URL + file icon/cover upload",
  "- Datapack save/reload",
  "- Guild install (clear error OK if manifest API missing)",
  "- Launcher updater: install older build, publish this release, Updates → Update",
  "- docs/admin-smoke-checklist.md",
  "- docs/launcher-updater.md"
)
$lines | Set-Content -Encoding utf8 $ManifestPath

Write-Host ""
Write-Host "Release artifacts ready:"
Write-Host "  $Nsis"
Write-Host "  $NsisSig"
Write-Host "  $LatestPath"
if ($Msi) { Write-Host "  $Msi" }
Write-Host "  $ManifestPath"
Write-Host ""
Write-Host "Publish with:"
Write-Host "  gh release create v$SemVer --repo $GitHubRepo --title `"CultForge $Display`" --notes `"CultForge $Display`" ``"
Write-Host "    `"$LatestPath`" ``"
Write-Host "    `"$(Join-Path $ReleaseDir $NsisName)`" ``"
Write-Host "    `"$(Join-Path $ReleaseDir "$NsisName.sig")`""
Write-Host "Done."
