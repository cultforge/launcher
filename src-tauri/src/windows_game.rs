//! Register CultForge and javaw.exe so Windows Game Bar / Game Mode treat them as games.

use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
#[link(name = "shell32")]
unsafe extern "system" {
    fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
}

fn set_aumid() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new("com.cultforge.app")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let _ = SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
        }
    }
}

fn register_exe_path(exe_path: &str) {
    #[cfg(target_os = "windows")]
    {
        let path = exe_path.replace('/', "\\").replace('\'', "''");
        if path.trim().is_empty() {
            return;
        }
        let script = format!(
            r#"
$exe = '{path}'
$root = 'HKCU:\System\GameConfigStore\Children'
New-Item -Path $root -Force | Out-Null
$exists = $false
Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {{
  $p = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).MatchedExeFullPath
  if ($p -eq $exe) {{ $exists = $true }}
}}
if (-not $exists) {{
  $id = [guid]::NewGuid().ToString('B')
  $key = Join-Path $root $id
  New-Item -Path $key -Force | Out-Null
  New-ItemProperty -Path $key -Name 'MatchedExeFullPath' -Value $exe -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $key -Name 'ExeFilename' -Value ([IO.Path]::GetFileName($exe)) -PropertyType String -Force | Out-Null
}}
"#
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = exe_path;
    }
}

pub fn register_process_as_game() {
    set_aumid();
    if let Ok(exe) = std::env::current_exe() {
        register_exe_path(&exe.to_string_lossy());
    }
}

pub fn register_exe_as_game(exe_path: &str) {
    register_exe_path(exe_path);
}
