# Freeze client.py → dist-sidecar/client.exe
# Also copies into src-tauri/resources (installer) AND workspace root (tauri dev prefers root).
# Uses Python 3.11 + Nuitka (MSVC, LTO, onefile, no console).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$OutDir = Join-Path $Root "dist-sidecar"
$ResDir = Join-Path $Root "src-tauri\resources"
$Log = Join-Path $OutDir "nuitka311-freeze.log"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $ResDir | Out-Null

$Icon = (Resolve-Path (Join-Path $Root "src-tauri\icons\icon.ico")).Path
$VenvPy = Join-Path $Root ".venv-sidecar311\Scripts\python.exe"

if (-not (Test-Path $VenvPy)) {
  Write-Host "Creating .venv-sidecar311 (Python 3.11)…"
  py -3.11 -m venv .venv-sidecar311
  & $VenvPy -m pip install -U pip wheel nuitka ordered-set zstandard
  & $VenvPy -m pip install -r requirements.txt sniffio
}

Get-Process | Where-Object { $_.ProcessName -in @("client", "cultforge-sidecar") } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

foreach ($name in @("client.exe", "cultforge-sidecar.exe")) {
  $p = Join-Path $OutDir $name
  if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
}
$RootClient = Join-Path $Root "client.exe"
if (Test-Path $RootClient) {
  Remove-Item $RootClient -Force -ErrorAction SilentlyContinue
}

Write-Host "Using: $VenvPy"
Write-Host "Freezing with Nuitka → client.exe…"
Write-Host "Log: $Log"

$nuitkaArgs = @(
  "-m", "nuitka",
  "--msvc=latest",
  "--lto=yes",
  "--standalone",
  "--onefile",
  "--windows-console-mode=disable",
  "--windows-icon-from-ico=$Icon",
  "--include-package=ctfgsdk",
  "--include-package=uvicorn",
  "--include-package=fastapi",
  "--include-package=starlette",
  "--include-package=pydantic",
  "--include-package=httpx",
  "--include-package=anyio",
  "--include-package=websockets",
  "--include-module=httptools",
  "--include-module=h11",
  "--include-module=sniffio",
  "--nofollow-import-to=tkinter",
  "--nofollow-import-to=unittest",
  "--assume-yes-for-downloads",
  "--output-filename=client.exe",
  "--output-dir=$OutDir",
  "--remove-output",
  "client.py"
)

cmd /c "`"$VenvPy`" $($nuitkaArgs -join ' ') > `"$Log`" 2>&1"
if ($LASTEXITCODE -ne 0) {
  Get-Content $Log -Tail 40
  throw "Nuitka failed with exit code $LASTEXITCODE (see $Log)"
}

$Target = Join-Path $OutDir "client.exe"
if (-not (Test-Path $Target)) {
  throw "Freeze failed: $Target not found"
}

$ResClient = Join-Path $ResDir "client.exe"
Copy-Item $Target $ResClient -Force
Copy-Item $Target $RootClient -Force
Write-Host "Copied to src-tauri\resources\client.exe (installer bundle)"
Write-Host "Copied to workspace root client.exe (tauri dev resolution)"

# Keep companion binaries in the installer resource tree when present.
# Prefer fetched copies from `npm run companions:fetch` (Phase 1+).
# Patch CUI→GUI so Windows never flashes a console when helpers spawn/crash.
$PatchPy = Join-Path $PSScriptRoot "patch-pe-gui-subsystem.py"
foreach ($companion in @("scanner.exe", "ctfgbroker.exe")) {
  $src = Join-Path $Root $companion
  $res = Join-Path $ResDir $companion
  if (Test-Path $src) {
    py -3 $PatchPy $src
    Copy-Item $src $res -Force
    Write-Host "Copied $companion → src-tauri\resources\"
  } elseif (Test-Path $res) {
    py -3 $PatchPy $res
    Write-Host "Using existing resources\$companion"
  } else {
    Write-Host "WARN: missing $companion (run npm run companions:fetch for scanner)"
  }
}

Write-Host "Done: $Target"
Get-Item $Target | Format-List Name, Length, LastWriteTime
