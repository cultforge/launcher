# CultForge pre-uninstall placeholder
param(
  [Parameter(Position = 0)]
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Continue"

function Normalize-InstallDir([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return "" }
  $p = $p.Trim().Trim("`"", "'")
  while ($p.Length -gt 0 -and ($p.EndsWith('"') -or $p.EndsWith("'"))) {
    $p = $p.Substring(0, $p.Length - 1).TrimEnd()
  }
  $p = $p.TrimEnd('\', '/')
  if (-not $p) { return "" }
  try { return [System.IO.Path]::GetFullPath($p) } catch { return $p }
}

$InstallDir = Normalize-InstallDir $InstallDir

Write-Host "[CultForge] pre-uninstall"
if ($InstallDir) {
  Write-Host "[CultForge] install dir: $InstallDir"
}

# Stop CultForge / client.exe before file removal
Get-Process | Where-Object { $_.ProcessName -in @("CultForge", "cultforge", "client", "cultforge-sidecar") } |
  Stop-Process -Force -ErrorAction SilentlyContinue

exit 0
