# Upload local Windows Nuitka client.exe to an existing client-v* release.
# Unix assets come from GitHub Actions (Build client workflow).
#
# Usage:
#   npm run sidecar:freeze
#   powershell -File scripts/upload-client-windows.ps1
#   powershell -File scripts/upload-client-windows.ps1 -Tag client-v0.1.0

param(
  [string]$Tag = "client-v0.1.0",
  [string]$Repo = "cultforge/launcher"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Exe = Join-Path $Root "dist-sidecar\client.exe"
if (-not (Test-Path $Exe)) {
  $Exe = Join-Path $Root "src-tauri\resources\client.exe"
}
if (-not (Test-Path $Exe)) {
  throw "client.exe not found. Run: npm run sidecar:freeze"
}

$ShaPath = Join-Path (Split-Path $Exe) "client.exe.sha256"
$hash = (Get-FileHash -Algorithm SHA256 -Path $Exe).Hash.ToLowerInvariant()
Set-Content -Encoding ascii $ShaPath "$hash  client.exe"
Write-Host "Uploading $Exe → $Repo @ $Tag"
Write-Host "SHA256 $hash"

# Ensure release exists (created by unix CI, or create empty shell).
$exists = gh release view $Tag --repo $Repo 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Release $Tag missing — creating placeholder for Windows upload…"
  gh release create $Tag --repo $Repo --title "CultForge client $Tag" --notes "Windows client.exe (manual). Unix assets from Actions."
}

gh release upload $Tag $Exe $ShaPath --repo $Repo --clobber
Write-Host "Done. https://github.com/$Repo/releases/tag/$Tag"
