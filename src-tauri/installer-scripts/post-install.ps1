# CultForge post-install
# - Prefer high-performance GPU for javaw.exe when a discrete GPU is present
# - On iGPU-only systems, leave default GPU preference (avoid driver quirks / crashes)
# - Set high CPU priority for javaw.exe when registry write is allowed
# Arg0 = install directory (e.g. %LOCALAPPDATA%\CultForge)

param(
  [Parameter(Position = 0)]
  [string]$InstallDir = $PSScriptRoot
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# MSI/NSIS often pass INSTALLDIR with a trailing "\" inside quotes → PowerShell
# sees a literal trailing quote (..."CultForge\"). Strip junk before any path IO.
function Normalize-InstallDir([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return "" }
  $p = $p.Trim()
  $p = $p.Trim("`"", "'")
  while ($p.Length -gt 0 -and ($p.EndsWith('"') -or $p.EndsWith("'"))) {
    $p = $p.Substring(0, $p.Length - 1).TrimEnd()
  }
  $p = $p.TrimEnd('\', '/')
  if (-not $p) { return "" }
  try {
    return [System.IO.Path]::GetFullPath($p)
  } catch {
    return $p
  }
}

if (-not $InstallDir) { $InstallDir = $PSScriptRoot }
$InstallDir = Normalize-InstallDir $InstallDir
if (-not $InstallDir) { $InstallDir = Normalize-InstallDir $PSScriptRoot }

function Write-Cf([string]$msg) {
  Write-Host "[CultForge] $msg"
}

Write-Cf "post-install"
Write-Cf "install dir: $InstallDir"

# Point ctfgbroker / tooling at the install tree
try {
  if ($InstallDir) {
    [Environment]::SetEnvironmentVariable("CULTFORGE_HOME", $InstallDir, "User")
    $env:CULTFORGE_HOME = $InstallDir
    Write-Cf "CULTFORGE_HOME (User) = $InstallDir"
    $apiDir = Join-Path $InstallDir "api"
    New-Item -ItemType Directory -Force -Path $apiDir | Out-Null
    $mping = Join-Path $apiDir "mping.json"
    if (-not (Test-Path -LiteralPath $mping)) {
      Set-Content -LiteralPath $mping -Value "[]" -Encoding UTF8
      Write-Cf "created api\mping.json"
    }
  }
} catch {
  Write-Cf "CULTFORGE_HOME set failed: $($_.Exception.Message)"
}

# Ensure Temurin Java 17 (same as pre-install - NSIS/MSI may skip pre before files exist)
$preScript = Join-Path $PSScriptRoot "pre-install.ps1"
if (-not (Test-Path -LiteralPath $preScript)) {
  $preScript = Join-Path $InstallDir "installer-scripts\pre-install.ps1"
}
if (Test-Path -LiteralPath $preScript) {
  Write-Cf "ensuring Java 17 via pre-install.ps1"
  try {
    & $preScript $InstallDir
  } catch {
    Write-Cf "pre-install/Java step: $($_.Exception.Message)"
  }
} else {
  Write-Cf "pre-install.ps1 not found - skipping Java ensure"
}

# --- Detect discrete GPU (best-effort) ---------------------------------------
function Test-HasDiscreteGpu {
  try {
    $adapters = Get-CimInstance Win32_VideoController -ErrorAction Stop
    foreach ($a in $adapters) {
      $name = [string]$a.Name
      if (-not $name) { continue }
      # Skip obvious software / remote adapters
      if ($name -match "Microsoft Basic|Remote|Virtual|Parsec|VMware|VirtualBox|Hyper-V") {
        continue
      }
      # Treat common dGPU vendors as discrete when present alongside another adapter,
      # or when AdapterRAM looks substantial.
      $ram = 0
      try { $ram = [int64]$a.AdapterRAM } catch { $ram = 0 }
      if ($name -match "NVIDIA|GeForce|RTX|GTX|Quadro|AMD Radeon RX|Radeon Pro|Intel Arc") {
        return $true
      }
      if ($ram -gt 1GB -and $name -notmatch "Intel\(R\) UHD|Intel\(R\) HD|Intel\(R\) Iris") {
        return $true
      }
    }
  } catch {
    Write-Cf "GPU detect failed: $($_.Exception.Message) - assuming no dGPU"
  }
  return $false
}

$hasDgpu = Test-HasDiscreteGpu
if ($hasDgpu) {
  Write-Cf "discrete GPU detected -> GpuPreference=2 (high performance) for javaw.exe"
  $gpuValue = "GpuPreference=2;"
} else {
  Write-Cf "iGPU-only / unknown -> GpuPreference=0 (system default) for javaw.exe"
  $gpuValue = "GpuPreference=0;"
}

# --- Find javaw.exe candidates ----------------------------------------------
$javaws = New-Object System.Collections.Generic.List[string]

function Add-JavaW([string]$path) {
  if (-not $path) { return }
  try {
    $full = [System.IO.Path]::GetFullPath($path)
  } catch {
    return
  }
  if (-not (Test-Path -LiteralPath $full)) { return }
  if ($javaws -contains $full) { return }
  $javaws.Add($full) | Out-Null
}

# PATH
try {
  $cmd = Get-Command javaw.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { Add-JavaW $cmd.Source }
} catch {}

# JAVA_HOME / JDK_HOME
foreach ($envName in @("JAVA_HOME", "JDK_HOME")) {
  $root = [Environment]::GetEnvironmentVariable($envName, "Process")
  if (-not $root) { $root = [Environment]::GetEnvironmentVariable($envName, "User") }
  if (-not $root) { $root = [Environment]::GetEnvironmentVariable($envName, "Machine") }
  if ($root) {
    Add-JavaW (Join-Path $root "bin\javaw.exe")
  }
}

# Common install roots
$searchRoots = @(
  "$env:ProgramFiles\Java",
  "$env:ProgramFiles\Eclipse Adoptium",
  "$env:ProgramFiles\Microsoft",
  "$env:ProgramFiles\Amazon Corretto",
  "$env:ProgramFiles\Zulu",
  "$env:ProgramFiles\BellSoft",
  "${env:ProgramFiles(x86)}\Java",
  "$env:LOCALAPPDATA\Programs\Eclipse Adoptium",
  "$env:LOCALAPPDATA\Programs\Microsoft",
  "$env:USERPROFILE\.jdks",
  "$env:USERPROFILE\.gradle\jdks",
  "$env:APPDATA\CultForge",
  "$env:LOCALAPPDATA\CultForge"
)

foreach ($root in $searchRoots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  try {
    Get-ChildItem -LiteralPath $root -Filter "javaw.exe" -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 40 |
      ForEach-Object { Add-JavaW $_.FullName }
  } catch {}
}

# CultForge / Minecraft instance java (if any under install dir)
if ($InstallDir -and (Test-Path -LiteralPath $InstallDir)) {
  try {
    Get-ChildItem -LiteralPath $InstallDir -Filter "javaw.exe" -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 20 |
      ForEach-Object { Add-JavaW $_.FullName }
  } catch {}
}

Write-Cf ("found {0} javaw.exe path(s)" -f $javaws.Count)

$gpuKey = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
New-Item -Path $gpuKey -Force | Out-Null

foreach ($javaPath in $javaws) {
  try {
    Set-ItemProperty -Path $gpuKey -Name $javaPath -Value $gpuValue -Type String -Force
    Write-Cf "GPU preference set: $javaPath -> $gpuValue"
  } catch {
    Write-Cf "GPU preference failed for $javaPath : $($_.Exception.Message)"
  }

  # Persistent CPU priority via IFEO PerfOptions (High = 3). Prefer HKCU; try HKLM if elevated.
  $ifeoLeaf = "javaw.exe"
  $perfName = "CpuPriorityClass"
  $cpuValue = 3 # High
  foreach ($hive in @(
      "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$ifeoLeaf\PerfOptions",
      "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$ifeoLeaf\PerfOptions"
    )) {
    try {
      New-Item -Path $hive -Force -ErrorAction Stop | Out-Null
      New-ItemProperty -Path $hive -Name $perfName -Value $cpuValue -PropertyType DWord -Force -ErrorAction Stop | Out-Null
      Write-Cf "CPU priority High via $hive"
      break
    } catch {
      # continue - HKLM often needs admin on per-user installs
    }
  }

  # Game Mode / Game Bar recognition (same idea as launcher windows_game.rs)
  try {
    $root = "HKCU:\System\GameConfigStore\Children"
    New-Item -Path $root -Force | Out-Null
    $exists = $false
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $p = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).MatchedExeFullPath
      if ($p -eq $javaPath) { $exists = $true }
    }
    if (-not $exists) {
      $id = [guid]::NewGuid().ToString("B")
      $key = Join-Path $root $id
      New-Item -Path $key -Force | Out-Null
      New-ItemProperty -Path $key -Name "MatchedExeFullPath" -Value $javaPath -PropertyType String -Force | Out-Null
      New-ItemProperty -Path $key -Name "ExeFilename" -Value "javaw.exe" -PropertyType String -Force | Out-Null
      Write-Cf "registered as game: $javaPath"
    }
  } catch {
    Write-Cf "GameConfigStore skip: $($_.Exception.Message)"
  }
}

if ($javaws.Count -eq 0) {
  Write-Cf "no javaw.exe found yet - launcher will set GPU preference on first play"
}

# Ensure bundled sidecar name is client.exe if a legacy freeze slipped in
$legacy = Join-Path $InstallDir "cultforge-sidecar.exe"
$client = Join-Path $InstallDir "client.exe"
if ((Test-Path -LiteralPath $legacy) -and -not (Test-Path -LiteralPath $client)) {
  try {
    Move-Item -LiteralPath $legacy -Destination $client -Force
    Write-Cf "renamed cultforge-sidecar.exe -> client.exe"
  } catch {
    Write-Cf "sidecar rename skipped: $($_.Exception.Message)"
  }
}

Write-Cf "post-install done"
exit 0
