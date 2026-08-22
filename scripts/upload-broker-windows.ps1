# Upload local Windows ctfgbroker.exe to a broker-v* companion release.
# No unix build in-repo yet (binary-only companion).
#
# Usage:
#   powershell -File scripts/upload-broker-windows.ps1
#   powershell -File scripts/upload-broker-windows.ps1 -Tag broker-v0.1.0

param(
  [string]$Tag = "broker-v0.1.0",
  [string]$Repo = "cultforge/launcher"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Exe = Join-Path $Root "src-tauri\resources\ctfgbroker.exe"
if (-not (Test-Path $Exe)) {
  $Exe = Join-Path $Root "ctfgbroker.exe"
}
if (-not (Test-Path $Exe)) {
  throw "ctfgbroker.exe not found under resources/ or workspace root"
}

$ShaPath = Join-Path (Split-Path $Exe) "ctfgbroker.exe.sha256"
$hash = (Get-FileHash -Algorithm SHA256 -Path $Exe).Hash.ToLowerInvariant()
Set-Content -Encoding ascii $ShaPath "$hash  ctfgbroker.exe"
Write-Host "Uploading $Exe -> $Repo @ $Tag"
Write-Host "SHA256 $hash"

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
gh release view $Tag --repo $Repo 2>$null | Out-Null
$viewCode = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($viewCode -ne 0) {
  Write-Host "Release $Tag missing - creating..."
  gh release create $Tag --repo $Repo --title "CultForge broker $Tag" --notes "Windows ctfgbroker.exe (manual upload). Unix builds TBD."
}

gh release upload $Tag $Exe $ShaPath --repo $Repo --clobber
Write-Host "Done. https://github.com/$Repo/releases/tag/$Tag"
