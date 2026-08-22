//! Local Minecraft server status broker (`ctfgbroker` / mping).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use once_cell::sync::Lazy;

use crate::win_proc;

static MPING_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));
const DEFAULT_PORT: u16 = 8270;

fn broker_binary_names() -> &'static [&'static str] {
    #[cfg(windows)]
    {
        &["ctfgbroker.exe", "ctfgbroker"]
    }
    #[cfg(not(windows))]
    {
        &["ctfgbroker", "ctfgbroker.exe"]
    }
}

fn cultforge_home() -> PathBuf {
    if let Ok(home) = std::env::var("CULTFORGE_HOME") {
        let p = PathBuf::from(home.trim());
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.to_path_buf();
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("CultForge");
    }
    PathBuf::from("CultForge")
}

fn prepare_broker_binary(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = std::fs::metadata(path)
            .map_err(|e| format!("broker metadata {}: {e}", path.display()))?;
        let mut perms = meta.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            perms.set_mode(mode | 0o755);
            std::fs::set_permissions(path, perms)
                .map_err(|e| format!("chmod +x {}: {e}", path.display()))?;
        }
        let _ = Command::new("xattr")
            .args(["-d", "com.apple.quarantine"])
            .arg(path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = path;
    Ok(())
}

fn look_for_broker() -> Option<PathBuf> {
    let names = broker_binary_names();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in names {
                candidates.push(dir.join(name));
                candidates.push(dir.join("resources").join(name));
            }
        }
    }
    let home = cultforge_home();
    for name in names {
        candidates.push(home.join(name));
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for name in names {
        candidates.push(manifest.join("resources").join(name));
        candidates.push(manifest.join("..").join(name));
    }
    for candidate in candidates {
        if candidate.is_file() {
            if let Ok(canonical) = candidate.canonicalize() {
                return Some(canonical);
            }
            return Some(candidate);
        }
    }
    None
}

fn mping_json_path() -> PathBuf {
    cultforge_home().join("api").join("mping.json")
}

#[tauri::command]
pub fn get_cultforge_home() -> String {
    cultforge_home().to_string_lossy().to_string()
}

#[tauri::command]
pub fn get_mping_port() -> u16 {
    std::env::var("MPING_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

/// Replace `{CULTFORGE_HOME}/api/mping.json` with the given address list.
#[tauri::command]
pub fn write_mping_servers(servers: Vec<String>) -> Result<(), String> {
    let path = mping_json_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create api dir: {e}"))?;
    }
    let cleaned: Vec<String> = servers
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let json = serde_json::to_string_pretty(&cleaned)
        .map_err(|e| format!("Serialize mping.json: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Write mping.json: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn read_mping_servers() -> Result<Vec<String>, String> {
    let path = mping_json_path();
    if !path.is_file() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Read mping.json: {e}"))?;
    let list: Vec<String> =
        serde_json::from_str(&raw).map_err(|e| format!("Parse mping.json: {e}"))?;
    Ok(list)
}

/// Spawn ctfgbroker if present (idempotent).
#[tauri::command]
pub fn ensure_mping_broker() -> Result<String, String> {
    {
        let mut slot = MPING_CHILD.lock().unwrap();
        if let Some(child) = slot.as_mut() {
            match child.try_wait() {
                Ok(None) => return Ok(format!("already running on {}", get_mping_port())),
                Ok(Some(_)) => {
                    *slot = None;
                }
                Err(_) => {
                    *slot = None;
                }
            }
        }
    }

    let broker = look_for_broker().ok_or_else(|| {
        "ctfgbroker not found. Run `npm run companions:fetch` or place it next to CultForge."
            .to_string()
    })?;
    prepare_broker_binary(&broker)?;

    // Ensure mping.json exists so broker does not exit 0 immediately.
    let path = mping_json_path();
    if !path.is_file() {
        write_mping_servers(vec![])?;
    }

    let home = cultforge_home();
    let port = get_mping_port();
    let mut cmd = Command::new(&broker);
    cmd.arg(port.to_string())
        .env("CULTFORGE_HOME", &home)
        .env("MPING_PORT", port.to_string())
        .current_dir(&home)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    win_proc::apply_no_window(&mut cmd);

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn ctfgbroker: {e}"))?;
    *MPING_CHILD.lock().unwrap() = Some(child);
    Ok(format!(
        "started {} (home {}, port {})",
        broker.display(),
        home.display(),
        port
    ))
}

pub fn kill_mping_broker() {
    if let Some(mut child) = MPING_CHILD.lock().unwrap().take() {
        win_proc::kill_tree(&mut child);
    }
    win_proc::kill_image("ctfgbroker.exe");
    win_proc::kill_image("ctfgbroker");
}
