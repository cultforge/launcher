# CultForge pre-install
# - Stop leftover launcher/sidecar processes when safe
# - Ensure Temurin Java 17 JRE under %APPDATA%\CultForge\runtimes\java-17
#   (same layout as the launcher's ensure_java / java_runtime)
#
# Arg0 = install directory (when available)
# MSI: optional override at $env:TEMP\cultforge-pre-install.ps1
# NSIS: also invoked from post-install (bundled scripts are available then)

param(
  [Parameter(Position = 0)]
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

function Write-Cf([string]$msg) {
  Write-Host "[CultForge] $msg"
}

Write-Cf "pre-install"
if ($InstallDir) {
  Write-Cf "target: $InstallDir"
}

# --- Stop previous CultForge processes (best-effort) -------------------------
try {
  Get-Process | Where-Object {
    $_.ProcessName -in @("CultForge", "cultforge", "client", "cultforge-sidecar")
  } | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

# --- Java 17 (Temurin JRE) - matches src-tauri/src/java_runtime.rs ------------
$Major = 17
$UserAgent = "CultForge/2.4.1 (installer; java-runtime)"
$RuntimesRoot = Join-Path $env:APPDATA "CultForge\runtimes"
$JavaDir = Join-Path $RuntimesRoot "java-$Major"
$MetaPath = Join-Path $JavaDir "runtime.json"

function Find-JavaW([string]$root) {
  if (-not (Test-Path -LiteralPath $root)) { return $null }
  $direct = Join-Path $root "bin\javaw.exe"
  if (Test-Path -LiteralPath $direct) { return $direct }
  try {
    $hit = Get-ChildItem -LiteralPath $root -Filter "javaw.exe" -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($hit) { return $hit.FullName }
  } catch {}
  return $null
}

function Test-JavaMajor([string]$javaw, [int]$want) {
  if (-not $javaw -or -not (Test-Path -LiteralPath $javaw)) { return $false }
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $javaw
    $psi.Arguments = "-version"
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $err = $p.StandardError.ReadToEnd()
    $out = $p.StandardOutput.ReadToEnd()
    $p.WaitForExit(15000) | Out-Null
    $text = "$err$out"
    if ($text -match 'version "1\.8') { return ($want -le 8) }
    if ($text -match 'version "(\d+)') {
      return ([int]$Matches[1] -ge $want)
    }
  } catch {}
  return $false
}

function Get-ArchTag {
  $arch = [Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE")
  if ($arch -match "ARM64") { return "aarch64" }
  return "x64"
}

function Get-TemurinPackage([int]$major) {
  $arch = Get-ArchTag
  $headers = @{ "User-Agent" = $UserAgent }
  foreach ($imageType in @("jre", "jdk")) {
    $api = "https://api.adoptium.net/v3/assets/latest/$major/hotspot?os=windows&architecture=$arch&image_type=$imageType"
    Write-Cf "Adoptium lookup: $imageType Java $major ($arch)"
    try {
      $rows = Invoke-RestMethod -Uri $api -Headers $headers -TimeoutSec 60
    } catch {
      Write-Cf "Adoptium $imageType failed: $($_.Exception.Message)"
      continue
    }
    if (-not $rows) { continue }
    foreach ($row in @($rows)) {
      $package = $row.binary.package
      if (-not $package) { continue }
      $link = [string]$package.link
      $name = [string]$package.name
      if (-not $link) { continue }
      $lower = ($name + " " + $link).ToLowerInvariant()
      if ($lower -notmatch "\.zip") { continue }
      $version = $null
      if ($row.version.openjdk_version) { $version = [string]$row.version.openjdk_version }
      elseif ($row.version.semver) { $version = [string]$row.version.semver }
      else { $version = "unknown" }
      $sha = $null
      if ($package.checksum) { $sha = [string]$package.checksum }
      if (-not $name) { $name = "temurin-jre-$major.zip" }
      return [pscustomobject]@{
        Url      = $link
        Filename = $name
        Sha256   = $sha
        Version  = $version
      }
    }
  }
  return $null
}

function Install-TemurinJava17 {
  # Already managed?
  $existing = Find-JavaW $JavaDir
  if ($existing -and (Test-JavaMajor $existing $Major)) {
    Write-Cf "Java $Major already present: $existing"
    return $existing
  }

  # Usable system Java 17+ (skip download)
  try {
    $cmd = Get-Command javaw.exe -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-JavaMajor $cmd.Source $Major)) {
      Write-Cf "Using system javaw (Java $Major+): $($cmd.Source)"
      return $cmd.Source
    }
  } catch {}

  foreach ($envName in @("JAVA_HOME", "JDK_HOME")) {
    $root = [Environment]::GetEnvironmentVariable($envName, "Process")
    if (-not $root) { $root = [Environment]::GetEnvironmentVariable($envName, "User") }
    if (-not $root) { $root = [Environment]::GetEnvironmentVariable($envName, "Machine") }
    if (-not $root) { continue }
    $candidate = Join-Path $root "bin\javaw.exe"
    if ((Test-Path -LiteralPath $candidate) -and (Test-JavaMajor $candidate $Major)) {
      Write-Cf "Using $envName javaw: $candidate"
      return $candidate
    }
  }

  $pkg = Get-TemurinPackage $Major
  if (-not $pkg) {
    Write-Cf "Could not resolve Temurin Java $Major - launcher can install later"
    return $null
  }

  New-Item -ItemType Directory -Force -Path $RuntimesRoot | Out-Null
  $staging = Join-Path $env:TEMP ("cultforge-java-{0}-{1}" -f $Major, [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $staging $pkg.Filename
  New-Item -ItemType Directory -Force -Path $staging | Out-Null

  try {
    Write-Cf "Downloading Temurin $($pkg.Version)..."
    Write-Cf $pkg.Url
    Invoke-WebRequest -Uri $pkg.Url -OutFile $zipPath -UserAgent $UserAgent -TimeoutSec 600
    if (-not (Test-Path -LiteralPath $zipPath)) {
      throw "Download missing: $zipPath"
    }

    if ($pkg.Sha256) {
      $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
      $want = $pkg.Sha256.ToLowerInvariant()
      if ($hash -ne $want) {
        throw "SHA-256 mismatch (expected $want, got $hash)"
      }
      Write-Cf "SHA-256 OK"
    }

    if (Test-Path -LiteralPath $JavaDir) {
      Remove-Item -LiteralPath $JavaDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Force -Path $JavaDir | Out-Null

    Write-Cf "Extracting to $JavaDir"
    Expand-Archive -LiteralPath $zipPath -DestinationPath $JavaDir -Force

    # Adoptium zips nest one top folder (e.g. jdk-17.0.x+y-jre) - flatten if needed
    $javaw = Find-JavaW $JavaDir
    if (-not $javaw) {
      throw "Extracted archive has no javaw.exe"
    }

    $rel = $javaw.Substring($JavaDir.Length).TrimStart("\", "/")
    $rel = $rel.Replace("\", "/")
    $meta = @{
      major   = $Major
      version = $pkg.Version
      vendor  = "temurin"
      javaw   = $rel
    } | ConvertTo-Json
    Set-Content -LiteralPath $MetaPath -Value $meta -Encoding UTF8
    Write-Cf "Installed managed Java $Major -> $javaw"
    return $javaw
  } catch {
    Write-Cf "Java $Major install failed: $($_.Exception.Message)"
    return $null
  } finally {
    try {
      if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
}

$javaw = Install-TemurinJava17
if ($javaw) {
  Write-Cf "Java ready: $javaw"
} else {
  Write-Cf "Java 17 not installed yet - first launch can finish setup"
}

Write-Cf "pre-install done"
