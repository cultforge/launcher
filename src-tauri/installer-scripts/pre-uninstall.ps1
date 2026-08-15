# CultForge pre-uninstall placeholder
param(
  [Parameter(Position = 0)]
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Continue"
Write-Host "[CultForge] pre-uninstall"
if ($InstallDir) {
  Write-Host "[CultForge] install dir: $InstallDir"
}

# Stop CultForge / client.exe before file removal
Get-Process | Where-Object { $_.ProcessName -in @("CultForge", "cultforge", "client", "cultforge-sidecar") } |
  Stop-Process -Force -ErrorAction SilentlyContinue

exit 0
