use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

const ALLOWED_METHODS: &[&str] =
    &["scan_mods", "scan_mod", "scan_world", "scan_worlds", "scan_builds"];
const CALL_TIMEOUT_SECS: u64 = 180;

struct ScannerProc {
    child: Child,
    stdin: ChildStdin,
}

static SCANNER: Lazy<Mutex<Option<ScannerProc>>> = Lazy::new(|| Mutex::new(None));
static NEXT_ID: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(1));
static PENDING: Lazy<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn scanner_exe_path() -> PathBuf {
    if let Ok(p) = std::env::var("CULTFORGE_SCANNER") {
        return PathBuf::from(p);
    }
    // Installed layout: next to CultForge.exe or resources/
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..4 {
            if let Some(ref d) = dir {
                for candidate in [d.join("scanner.exe"), d.join("resources").join("scanner.exe")] {
                    if candidate.exists() {
                        if let Ok(canonical) = candidate.canonicalize() {
                            return canonical;
                        }
                        return candidate;
                    }
                }
                dir = d.parent().map(|p| p.to_path_buf());
            }
        }
    }
    // Dev workspace
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("scanner.exe");
    if let Ok(canonical) = workspace.canonicalize() {
        return canonical;
    }
    if workspace.exists() {
        return workspace;
    }
    let res = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("scanner.exe");
    if let Ok(canonical) = res.canonicalize() {
        return canonical;
    }
    if res.exists() {
        return res;
    }
    PathBuf::from("scanner.exe")
}

fn fail_all_pending(reason: &str) {
    if let Ok(mut pending) = PENDING.lock() {
        for (_, tx) in pending.drain() {
            let _ = tx.send(Err(reason.to_string()));
        }
    }
}

fn spawn_scanner(app: &AppHandle) -> Result<(), String> {
    let exe = scanner_exe_path();
    if !exe.exists() {
        return Err(format!(
            "scanner.exe not found at {}. Set CULTFORGE_SCANNER or place scanner.exe in the workspace root.",
            exe.display()
        ));
    }

    let workdir = exe
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    let mut child = Command::new(&exe);
    child
        .current_dir(&workdir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        child.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = child
        .spawn()
        .map_err(|e| format!("Failed to spawn scanner.exe: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "scanner.exe stdin unavailable".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "scanner.exe stdout unavailable".to_string())?;

    let reader_app = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
                continue;
            };
            if let Some(id) = value.get("id").and_then(|v| v.as_u64()) {
                let sender = PENDING.lock().ok().and_then(|mut p| p.remove(&id));
                if let Some(tx) = sender {
                    let outcome = if let Some(err) = value.get("error") {
                        Err(err
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("scanner error")
                            .to_string())
                    } else {
                        Ok(value.get("result").cloned().unwrap_or(Value::Null))
                    };
                    let _ = tx.send(outcome);
                }
            } else if let Some(method) = value.get("method").and_then(|v| v.as_str()) {
                let _ = reader_app.emit(
                    "scanner-event",
                    json!({
                        "method": method,
                        "params": value.get("params").cloned().unwrap_or(Value::Null),
                    }),
                );
            }
        }
        // Process ended; unblock any waiters and clear the handle.
        fail_all_pending("scanner.exe exited");
        if let Ok(mut slot) = SCANNER.lock() {
            *slot = None;
        }
    });

    *SCANNER.lock().map_err(|_| "scanner state poisoned")? = Some(ScannerProc { child, stdin });
    eprintln!("[cultforge] Spawned scanner.exe from {}", exe.display());
    Ok(())
}

fn ensure_scanner(app: &AppHandle) -> Result<(), String> {
    {
        let mut slot = SCANNER.lock().map_err(|_| "scanner state poisoned")?;
        if let Some(proc) = slot.as_mut() {
            match proc.child.try_wait() {
                Ok(None) => return Ok(()),
                _ => *slot = None,
            }
        }
    }
    spawn_scanner(app)
}

pub fn kill_scanner() {
    fail_all_pending("scanner shutting down");
    if let Ok(mut slot) = SCANNER.lock() {
        if let Some(mut proc) = slot.take() {
            let _ = proc.child.kill();
            let _ = proc.child.wait();
        }
    }
}

#[tauri::command]
pub async fn scanner_call(
    app: AppHandle,
    method: String,
    params: Value,
) -> Result<Value, String> {
    if !ALLOWED_METHODS.contains(&method.as_str()) {
        return Err(format!("Scanner method not allowed: {method}"));
    }
    ensure_scanner(&app)?;

    let id = {
        let mut next = NEXT_ID.lock().map_err(|_| "scanner id poisoned")?;
        let id = *next;
        *next += 1;
        id
    };

    let (tx, rx) = oneshot::channel();
    PENDING
        .lock()
        .map_err(|_| "scanner pending poisoned")?
        .insert(id, tx);

    let request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    let line = format!("{request}\n");

    let write_result = {
        let mut slot = SCANNER.lock().map_err(|_| "scanner state poisoned")?;
        match slot.as_mut() {
            Some(proc) => proc
                .stdin
                .write_all(line.as_bytes())
                .and_then(|_| proc.stdin.flush())
                .map_err(|e| format!("Failed writing to scanner: {e}")),
            None => Err("scanner not running".to_string()),
        }
    };
    if let Err(e) = write_result {
        PENDING.lock().ok().and_then(|mut p| p.remove(&id));
        kill_scanner();
        return Err(e);
    }

    match tokio::time::timeout(std::time::Duration::from_secs(CALL_TIMEOUT_SECS), rx).await {
        Ok(Ok(outcome)) => outcome.map(|mut value| {
            if method == "scan_world" || method == "scan_worlds" {
                stringify_world_seeds(&mut value);
            }
            value
        }),
        Ok(Err(_)) => Err("scanner response channel dropped".into()),
        Err(_) => {
            PENDING.lock().ok().and_then(|mut p| p.remove(&id));
            Err(format!("scanner call {method} timed out"))
        }
    }
}

/// Keep Minecraft i64 seeds exact for the webview (JSON numbers lose precision above 2^53).
fn stringify_world_seeds(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if key == "seed" || key == "RandomSeed" {
                    if let Some(n) = child.as_i64() {
                        *child = Value::String(n.to_string());
                    } else if let Some(n) = child.as_u64() {
                        *child = Value::String(n.to_string());
                    }
                } else {
                    stringify_world_seeds(child);
                }
            }
        }
        Value::Array(items) => {
            for child in items {
                stringify_world_seeds(child);
            }
        }
        _ => {}
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalBuild {
    pub id: String,
    pub name: String,
    pub path: String,
    pub mc: String,
    pub loader: String,
    pub created_ms: Option<u64>,
    pub modified_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFile {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub size_mb: f64,
    pub modified_ms: Option<u64>,
    pub enabled: bool,
}

pub fn default_minecraft_root() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join(".minecraft");
    }
    PathBuf::from(".minecraft")
}

fn system_time_ms(time: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    time.ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

fn parse_version_id(id: &str) -> (String, String) {
    let lower = id.to_lowercase();
    let loader = if lower.contains("neoforge") {
        "NeoForge"
    } else if lower.contains("forge") {
        "Forge"
    } else if lower.contains("fabric") {
        "Fabric"
    } else if lower.contains("quilt") {
        "Quilt"
    } else if lower.contains("optifine") {
        "OptiFine"
    } else {
        "Vanilla"
    };

    // Leading "1.20.1" style token is the Minecraft version.
    let mc = id
        .split(['-', '_', ' '])
        .find(|part| {
            let mut chars = part.chars();
            matches!(chars.next(), Some(c) if c.is_ascii_digit())
                && part.contains('.')
        })
        .unwrap_or(id)
        .to_string();

    (mc, loader.to_string())
}

fn looks_like_mc_version(s: &str) -> bool {
    let mut chars = s.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_digit()) && s.contains('.')
}

fn detect_loader_from_profile(doc: &serde_json::Value) -> Option<&'static str> {
    let main = doc
        .get("mainClass")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if main.contains("neoforge") || main.contains("net.neoforged") {
        return Some("NeoForge");
    }
    if main.contains("bootstraplauncher")
        || main.contains("cpw.mods")
        || main.contains("minecraftforge")
        || main.contains("fml.")
    {
        return Some("Forge");
    }
    if main.contains("fabric") {
        return Some("Fabric");
    }
    if main.contains("quilt") {
        return Some("Quilt");
    }
    if main.contains("optifine") {
        return Some("OptiFine");
    }

    if let Some(libs) = doc.get("libraries").and_then(|v| v.as_array()) {
        for lib in libs {
            let name = lib
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if name.contains("net.neoforged:") || name.contains(":neoforge:") {
                return Some("NeoForge");
            }
            if name.contains("net.minecraftforge:fmlloader")
                || name.contains("net.minecraftforge:forge")
                || name.contains("cpw.mods:bootstraplauncher")
            {
                return Some("Forge");
            }
            if name.contains("net.fabricmc:fabric-loader") {
                return Some("Fabric");
            }
            if name.contains("org.quiltmc:quilt-loader") {
                return Some("Quilt");
            }
            if name.contains("optifine:optifine") {
                return Some("OptiFine");
            }
        }
    }
    None
}

fn detect_mc_from_profile(doc: &serde_json::Value, fallback_id: &str) -> String {
    // Common Forge/NeoForge coordinate: fmlloader:1.20.1-47.4.0
    if let Some(libs) = doc.get("libraries").and_then(|v| v.as_array()) {
        for lib in libs {
            let name = lib.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let lower = name.to_ascii_lowercase();
            if lower.contains("fmlloader:") || lower.contains(":forge:") || lower.contains(":neoforge:")
            {
                if let Some(ver) = name.split(':').nth(2) {
                    let mc = ver.split('-').next().unwrap_or(ver);
                    if looks_like_mc_version(mc) {
                        return mc.to_string();
                    }
                }
            }
        }
    }
    if let Some(inherits) = doc.get("inheritsFrom").and_then(|v| v.as_str()) {
        if looks_like_mc_version(inherits) {
            return inherits.to_string();
        }
        let (mc, _) = parse_version_id(inherits);
        if looks_like_mc_version(&mc) {
            return mc;
        }
    }
    // Scan game args for --fml.mcVersion value (string or values-object form)
    if let Some(game) = doc.pointer("/arguments/game").and_then(|v| v.as_array()) {
        let mut expect = false;
        for item in game {
            if expect {
                if let Some(s) = item.as_str() {
                    if looks_like_mc_version(s) {
                        return s.to_string();
                    }
                }
                if let Some(arr) = item.get("values").and_then(|v| v.as_array()) {
                    if let Some(s) = arr.first().and_then(|v| v.as_str()) {
                        if looks_like_mc_version(s) {
                            return s.to_string();
                        }
                    }
                }
                expect = false;
            }
            if item.as_str() == Some("--fml.mcVersion") {
                expect = true;
                continue;
            }
            if let Some(arr) = item.get("values").and_then(|v| v.as_array()) {
                if arr.first().and_then(|v| v.as_str()) == Some("--fml.mcVersion") {
                    expect = true;
                }
            }
        }
    }
    let (mc, _) = parse_version_id(fallback_id);
    mc
}

fn inspect_version_folder(path: &Path, id: &str) -> (String, String) {
    let (mut mc, mut loader) = parse_version_id(id);
    let json_path = path.join(format!("{id}.json"));
    let Ok(raw) = std::fs::read_to_string(&json_path) else {
        return (mc, loader);
    };
    let Ok(doc) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return (mc, loader);
    };
    if let Some(detected) = detect_loader_from_profile(&doc) {
        loader = detected.to_string();
    }
    let detected_mc = detect_mc_from_profile(&doc, id);
    if looks_like_mc_version(&detected_mc) {
        mc = detected_mc;
    }
    (mc, loader)
}

#[tauri::command]
pub fn get_minecraft_root() -> String {
    default_minecraft_root().to_string_lossy().to_string()
}

#[tauri::command]
pub fn list_local_builds(root: String) -> Result<Vec<LocalBuild>, String> {
    let base = if root.trim().is_empty() {
        default_minecraft_root()
    } else {
        PathBuf::from(root)
    };
    let versions = base.join("versions");
    if !versions.exists() {
        return Ok(vec![]);
    }

    let entries = std::fs::read_dir(&versions)
        .map_err(|e| format!("Failed to read {}: {e}", versions.display()))?;

    let mut builds = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        let meta = entry.metadata().ok();
        let (mc, loader) = inspect_version_folder(&path, &id);
        builds.push(LocalBuild {
            name: id.clone(),
            id,
            path: path.to_string_lossy().to_string(),
            mc,
            loader,
            created_ms: meta.as_ref().and_then(|m| system_time_ms(m.created())),
            modified_ms: meta.as_ref().and_then(|m| system_time_ms(m.modified())),
        });
    }
    builds.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(builds)
}

fn list_files_with_ext(dir: &Path, extensions: &[&str]) -> Vec<LocalFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut files = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let lower = file_name.to_lowercase();
        // ".disabled" suffix convention marks a disabled pack/mod.
        let enabled = !lower.ends_with(".disabled");
        let effective = lower.trim_end_matches(".disabled").to_string();
        if !extensions
            .iter()
            .any(|ext| effective.ends_with(&format!(".{ext}")))
        {
            continue;
        }
        let meta = entry.metadata().ok();
        let size_mb = meta
            .as_ref()
            .map(|m| (m.len() as f64) / (1024.0 * 1024.0))
            .unwrap_or(0.0);
        let stem = file_name
            .trim_end_matches(".disabled")
            .rsplit_once('.')
            .map(|(s, _)| s.to_string())
            .unwrap_or_else(|| file_name.clone());
        files.push(LocalFile {
            name: stem,
            file_name,
            path: path.to_string_lossy().to_string(),
            size_mb: (size_mb * 100.0).round() / 100.0,
            modified_ms: meta.as_ref().and_then(|m| system_time_ms(m.modified())),
            enabled,
        });
    }
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files
}

fn dir_size_bytes(path: &Path, depth: u32) -> u64 {
    if depth > 12 {
        return 0;
    }
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let child = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            total = total.saturating_add(dir_size_bytes(&child, depth + 1));
        } else if file_type.is_file() {
            if let Ok(meta) = entry.metadata() {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}

fn list_world_dirs(dir: &Path) -> Vec<LocalFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut worlds = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() || !path.join("level.dat").exists() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = entry.metadata().ok();
        let size_mb = dir_size_bytes(&path, 0) as f64 / 1_048_576.0;
        worlds.push(LocalFile {
            file_name: name.clone(),
            name,
            path: path.to_string_lossy().to_string(),
            size_mb: (size_mb * 100.0).round() / 100.0,
            modified_ms: meta.as_ref().and_then(|m| system_time_ms(m.modified())),
            enabled: true,
        });
    }
    worlds.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    worlds
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalContent {
    pub root: String,
    pub mods: Vec<LocalFile>,
    pub resourcepacks: Vec<LocalFile>,
    pub shaderpacks: Vec<LocalFile>,
    pub datapacks: Vec<LocalFile>,
    pub worlds: Vec<LocalFile>,
}

#[tauri::command]
pub fn list_local_content(root: String) -> Result<LocalContent, String> {
    let trimmed = root.trim();
    if trimmed.is_empty() {
        return Err("Missing build instance root".into());
    }
    let base = PathBuf::from(trimmed);

    Ok(LocalContent {
        root: base.to_string_lossy().to_string(),
        mods: list_files_with_ext(&base.join("mods"), &["jar"]),
        resourcepacks: list_files_with_ext(&base.join("resourcepacks"), &["zip"]),
        shaderpacks: list_files_with_ext(&base.join("shaderpacks"), &["zip"]),
        datapacks: list_files_with_ext(&base.join("datapacks"), &["zip"]),
        worlds: list_world_dirs(&base.join("saves")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn world_seeds_are_stringified_for_js() {
        let mut value = json!({
            "path": "C:\\\\saves\\\\Test01",
            "level_dat": {
                "Data": {
                    "WorldGenSettings": { "seed": -6354528715374607000i64 },
                    "RandomSeed": 123i64
                }
            }
        });
        stringify_world_seeds(&mut value);
        assert_eq!(
            value["level_dat"]["Data"]["WorldGenSettings"]["seed"],
            json!("-6354528715374607000")
        );
        assert_eq!(value["level_dat"]["Data"]["RandomSeed"], json!("123"));
    }
}
