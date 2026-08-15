//! Launch Minecraft against an existing `.minecraft` install.
//! CultForge instance path is used as `--gameDir`.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::scanner::default_minecraft_root;

static GAME_CHILD: Lazy<Mutex<Option<GameProcess>>> = Lazy::new(|| Mutex::new(None));
static WATCHER_ACTIVE: AtomicBool = AtomicBool::new(false);

struct GameProcess {
    child: Child,
    build_id: String,
    game_dir: String,
    started_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaInfo {
    pub path: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchStatus {
    pub running: bool,
    pub build_id: Option<String>,
    pub pid: Option<u32>,
    pub started_ms: Option<u64>,
    pub game_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftExitEvent {
    pub build_id: String,
    pub game_dir: String,
    pub started_ms: u64,
    pub exit_code: Option<i32>,
    pub killed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchMinecraftArgs {
    pub version_id: String,
    pub game_dir: String,
    pub build_id: String,
    pub minecraft_root: Option<String>,
    pub java_hint: Option<String>,
    pub memory_min_mb: Option<u32>,
    pub memory_max_mb: Option<u32>,
    pub jvm_args: Option<String>,
    pub player_name: String,
    pub fullscreen: Option<bool>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub dedicated_gpu: Option<bool>,
    pub wrapper: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Windows Graphics Settings GpuPreference: 0 default, 1 power-saving, 2 high-performance.
fn set_gpu_preference(java_path: &str, dedicated: bool) {
    #[cfg(target_os = "windows")]
    {
        let path = java_path.replace('/', "\\").replace('\'', "''");
        let value = if dedicated {
            "GpuPreference=2;"
        } else {
            "GpuPreference=0;"
        };
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "New-Item -Path 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences' -Name '{path}' -Value '{value}' -Type String -Force"
                ),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (java_path, dedicated);
    }
}

fn prefer_dedicated_gpu(java_path: &str) {
    set_gpu_preference(java_path, true);
}

#[tauri::command]
pub fn set_java_gpu_preference(
    java_hint: Option<String>,
    dedicated: bool,
) -> Result<String, String> {
    let preferred_major = java_hint.as_deref().and_then(|s| {
        let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
        digits.parse().ok()
    });
    let java = resolve_java(preferred_major)?;
    set_gpu_preference(&java.path, dedicated);
    Ok(java.path)
}

pub(crate) fn java_version_string(java: &Path) -> Option<String> {
    let output = Command::new(java)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stderr);
    let fallback = String::from_utf8_lossy(&output.stdout);
    let blob = if text.trim().is_empty() {
        fallback
    } else {
        text
    };
    Some(blob.lines().next()?.trim().to_string())
}

pub(crate) fn parse_java_major(version_line: &str) -> Option<u32> {
    // Examples: java version "1.8.0_412" / openjdk version "21.0.3"
    let quoted = version_line
        .split('"')
        .nth(1)
        .unwrap_or(version_line);
    let first = quoted.split(['.', '_', '-', '+']).next()?;
    let major: u32 = first.parse().ok()?;
    if major == 1 {
        // 1.8.x → 8
        quoted.split('.').nth(1)?.parse().ok()
    } else {
        Some(major)
    }
}

fn candidate_java_bins() -> Vec<PathBuf> {
    let mut out = crate::java_runtime::managed_java_bins();
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let home = PathBuf::from(home);
        out.push(home.join("bin").join("javaw.exe"));
        out.push(home.join("bin").join("java.exe"));
        out.push(home.join("bin").join("javaw"));
        out.push(home.join("bin").join("java"));
    }
    // PATH lookups handled via Command later; also probe common Windows roots.
    let program_files = [
        std::env::var("ProgramFiles").ok(),
        std::env::var("ProgramFiles(x86)").ok(),
        std::env::var("LOCALAPPDATA").ok(),
    ];
    for root in program_files.into_iter().flatten() {
        let base = PathBuf::from(root);
        for vendor in ["Java", "Eclipse Adoptium", "Microsoft", "Amazon Corretto", "Zulu"] {
            let vendor_dir = base.join(vendor);
            if let Ok(entries) = fs::read_dir(&vendor_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    out.push(p.join("bin").join("javaw.exe"));
                    out.push(p.join("bin").join("java.exe"));
                }
            }
        }
        // Graal / Temurin layout under LocalAppData\Programs
        let programs = base.join("Programs");
        if let Ok(entries) = fs::read_dir(programs) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.contains("java") || name.contains("jdk") || name.contains("temurin") {
                    out.push(entry.path().join("bin").join("javaw.exe"));
                }
            }
        }
    }
    out
}

fn which_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            let with_exe = dir.join(format!("{name}.exe"));
            if with_exe.is_file() {
                return Some(with_exe);
            }
        }
    }
    None
}

#[tauri::command]
pub fn resolve_java(preferred_major: Option<u32>) -> Result<JavaInfo, String> {
    let mut candidates: Vec<PathBuf> = candidate_java_bins()
        .into_iter()
        .filter(|p| p.is_file())
        .collect();
    for name in ["javaw", "java"] {
        if let Some(p) = which_on_path(name) {
            candidates.push(p);
        }
    }
    // Dedup
    candidates.sort();
    candidates.dedup();

    if candidates.is_empty() {
        return Err(
            "No Java runtime found. CultForge can download Temurin from Settings → Paths & Java."
                .into(),
        );
    }

    let mut scored: Vec<(i32, PathBuf, Option<String>)> = Vec::new();
    for path in candidates {
        let ver = java_version_string(&path);
        let major = ver.as_deref().and_then(parse_java_major);
        let mut score = 0;
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.to_lowercase().contains("javaw"))
        {
            score += 5;
        }
        if let (Some(want), Some(have)) = (preferred_major, major) {
            if have == want {
                score += 100;
            } else if have >= want {
                score += 40 - (have as i32 - want as i32).abs().min(30);
            } else {
                score -= 20;
            }
        } else if let Some(have) = major {
            // Prefer modern LTS
            score += match have {
                21 | 17 => 30,
                11 => 10,
                _ => have.min(25) as i32,
            };
        }
        scored.push((score, path, ver));
    }
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    let (_score, path, version) = scored
        .into_iter()
        .next()
        .ok_or_else(|| "No usable Java runtime found.".to_string())?;
    Ok(JavaInfo {
        path: path.to_string_lossy().to_string(),
        version,
    })
}

fn offline_uuid(name: &str) -> String {
    use md5::{Digest, Md5};
    let mut hasher = Md5::new();
    hasher.update(b"OfflinePlayer:");
    hasher.update(name.as_bytes());
    let mut bytes = hasher.finalize();
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    )
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid JSON {}: {e}", path.display()))
}

pub(crate) fn current_os() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub(crate) fn current_arch() -> &'static str {
    if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86") {
        "x86"
    } else {
        "unknown"
    }
}

pub(crate) fn rules_allow(rules: &Value) -> bool {
    let Some(arr) = rules.as_array() else {
        return true;
    };
    if arr.is_empty() {
        return true;
    }
    // Default deny if any rule present, then apply in order (Mojang style).
    let mut allowed = false;
    for rule in arr {
        let action = rule
            .get("action")
            .and_then(|a| a.as_str())
            .unwrap_or("allow");
        let mut matches = true;
        if let Some(os) = rule.get("os") {
            if let Some(name) = os.get("name").and_then(|n| n.as_str()) {
                if name != current_os() {
                    matches = false;
                }
            }
            if let Some(arch) = os.get("arch").and_then(|a| a.as_str()) {
                let arch_ok = match arch {
                    "x86" => current_arch() == "x86",
                    "x86_64" | "amd64" => current_arch() == "x86_64",
                    "arm64" | "aarch64" => current_arch() == "arm64",
                    _ => true,
                };
                if !arch_ok {
                    matches = false;
                }
            }
        }
        // features (is_demo_user, has_custom_resolution) — treat as non-matching for demo;
        // custom resolution handled separately.
        if let Some(features) = rule.get("features").and_then(|f| f.as_object()) {
            if features.keys().any(|k| k != "has_custom_resolution") {
                matches = false;
            }
        }
        if matches {
            allowed = action == "allow";
        }
    }
    allowed
}

#[derive(Default, Clone)]
struct VersionProfile {
    id: String,
    main_class: String,
    asset_index: String,
    minecraft_arguments: Option<String>,
    arguments_jvm: Vec<Value>,
    arguments_game: Vec<Value>,
    libraries: Vec<Value>,
    jar_id: String,
}

fn merge_version(base: &mut VersionProfile, doc: &Value) {
    if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
        // Child overrides parent — Forge needs the leaf id as ${version_name}.
        base.id = id.to_string();
        if base.jar_id.is_empty() {
            base.jar_id = id.to_string();
        }
    }
    if let Some(main) = doc.get("mainClass").and_then(|v| v.as_str()) {
        base.main_class = main.to_string();
    }
    if let Some(ai) = doc
        .get("assetIndex")
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_str())
    {
        base.asset_index = ai.to_string();
    } else if let Some(assets) = doc.get("assets").and_then(|v| v.as_str()) {
        if base.asset_index.is_empty() {
            base.asset_index = assets.to_string();
        }
    }
    if let Some(args) = doc.get("minecraftArguments").and_then(|v| v.as_str()) {
        base.minecraft_arguments = Some(args.to_string());
    }
    if let Some(arguments) = doc.get("arguments") {
        if let Some(jvm) = arguments.get("jvm").and_then(|v| v.as_array()) {
            base.arguments_jvm.extend(jvm.iter().cloned());
        }
        if let Some(game) = arguments.get("game").and_then(|v| v.as_array()) {
            base.arguments_game.extend(game.iter().cloned());
        }
    }
    if let Some(libs) = doc.get("libraries").and_then(|v| v.as_array()) {
        base.libraries.extend(libs.iter().cloned());
    }
    // Prefer this document's jar when it has downloads.client
    if doc
        .pointer("/downloads/client/url")
        .and_then(|v| v.as_str())
        .is_some()
    {
        if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
            base.jar_id = id.to_string();
        }
    }
}

fn load_version_profile(minecraft_root: &Path, version_id: &str) -> Result<VersionProfile, String> {
    let mut chain = Vec::new();
    let mut current = version_id.to_string();
    let mut seen = std::collections::HashSet::new();
    loop {
        if !seen.insert(current.clone()) {
            return Err(format!("Version inheritance loop at {current}"));
        }
        let path = minecraft_root
            .join("versions")
            .join(&current)
            .join(format!("{current}.json"));
        if !path.is_file() {
            return Err(format!(
                "Missing version profile {}. Install this version with the official launcher first.",
                path.display()
            ));
        }
        let doc = read_json_file(&path)?;
        let parent = doc
            .get("inheritsFrom")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        chain.push(doc);
        match parent {
            Some(p) => current = p,
            None => break,
        }
    }
    // Merge parent → child (child overrides): iterate reverse.
    let mut profile = VersionProfile::default();
    for doc in chain.iter().rev() {
        merge_version(&mut profile, doc);
    }
    // Always use the requested version id (leaf), even if merge missed it.
    profile.id = version_id.to_string();
    if profile.jar_id.is_empty() {
        profile.jar_id = profile.id.clone();
    }
    if profile.main_class.is_empty() {
        return Err("Version profile is missing mainClass".into());
    }
    if profile.asset_index.is_empty() {
        profile.asset_index = "legacy".into();
    }
    Ok(profile)
}

fn leaf_jar_path(minecraft_root: &Path, version_id: &str) -> PathBuf {
    minecraft_root
        .join("versions")
        .join(version_id)
        .join(format!("{version_id}.jar"))
}

fn library_artifact_path(minecraft_root: &Path, name: &str) -> Result<PathBuf, String> {
    // group:artifact:version[:classifier]
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return Err(format!("Bad library name: {name}"));
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).copied();
    let file = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.jar"),
        None => format!("{artifact}-{version}.jar"),
    };
    Ok(minecraft_root
        .join("libraries")
        .join(group)
        .join(artifact)
        .join(version)
        .join(file))
}

fn library_path_from_entry(minecraft_root: &Path, lib: &Value) -> Option<PathBuf> {
    if let Some(rules) = lib.get("rules") {
        if !rules_allow(rules) {
            return None;
        }
    }
    if let Some(path) = lib
        .pointer("/downloads/artifact/path")
        .and_then(|v| v.as_str())
    {
        return Some(minecraft_root.join("libraries").join(path));
    }
    let name = lib.get("name").and_then(|v| v.as_str())?;
    // Skip natives-only entries without artifact (handled separately)
    if lib.get("natives").is_some() && lib.pointer("/downloads/artifact").is_none() {
        return None;
    }
    library_artifact_path(minecraft_root, name).ok()
}

fn native_classifier(lib: &Value) -> Option<String> {
    let natives = lib.get("natives")?.as_object()?;
    let key = match current_os() {
        "windows" => "windows",
        "osx" => "osx",
        _ => "linux",
    };
    let raw = natives.get(key)?.as_str()?;
    Some(raw.replace("${arch}", if current_arch() == "x86" { "32" } else { "64" }))
}

fn native_jar_path(minecraft_root: &Path, lib: &Value) -> Option<PathBuf> {
    if let Some(rules) = lib.get("rules") {
        if !rules_allow(rules) {
            return None;
        }
    }
    let classifier = native_classifier(lib)?;
    if let Some(path) = lib
        .pointer(&format!("/downloads/classifiers/{classifier}/path"))
        .and_then(|v| v.as_str())
    {
        return Some(minecraft_root.join("libraries").join(path));
    }
    let name = lib.get("name").and_then(|v| v.as_str())?;
    let with_classifier = format!("{name}:{classifier}");
    library_artifact_path(minecraft_root, &with_classifier).ok()
}

fn extract_natives(natives_dir: &Path, jars: &[PathBuf]) -> Result<(), String> {
    fs::create_dir_all(natives_dir)
        .map_err(|e| format!("Failed to create natives dir {}: {e}", natives_dir.display()))?;
    for jar in jars {
        if !jar.is_file() {
            continue;
        }
        let file = File::open(jar).map_err(|e| format!("Open {}: {e}", jar.display()))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Zip {}: {e}", jar.display()))?;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Zip entry {}: {e}", jar.display()))?;
            let name = entry.name().replace('\\', "/");
            if name.starts_with("META-INF") {
                continue;
            }
            if entry.is_dir() {
                continue;
            }
            // Skip nested paths that aren't native binaries / shared libs
            let lower = name.to_lowercase();
            let is_native = lower.ends_with(".dll")
                || lower.ends_with(".so")
                || lower.ends_with(".dylib")
                || lower.ends_with(".jnilib");
            if !is_native {
                continue;
            }
            let file_name = Path::new(&name)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| name.clone());
            let out_path = natives_dir.join(file_name);
            if let Some(parent) = out_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let mut out = File::create(&out_path)
                .map_err(|e| format!("Create {}: {e}", out_path.display()))?;
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Read zip entry: {e}"))?;
            out.write_all(&buf)
                .map_err(|e| format!("Write {}: {e}", out_path.display()))?;
        }
    }
    Ok(())
}

fn expand_arg_tokens(arg: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = arg.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("${{{key}}}"), value);
    }
    out
}

fn flatten_args(items: &[Value], vars: &HashMap<&str, String>, custom_res: bool) -> Vec<String> {
    let mut out = Vec::new();
    for item in items {
        if let Some(s) = item.as_str() {
            out.push(expand_arg_tokens(s, vars));
            continue;
        }
        if let Some(obj) = item.as_object() {
            if let Some(rules) = obj.get("rules") {
                // Special-case has_custom_resolution feature
                let mut ok = rules_allow(rules);
                if let Some(arr) = rules.as_array() {
                    for rule in arr {
                        if let Some(features) =
                            rule.get("features").and_then(|f| f.as_object())
                        {
                            if features.contains_key("has_custom_resolution") {
                                let action = rule
                                    .get("action")
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("allow");
                                ok = if custom_res {
                                    action == "allow"
                                } else {
                                    action != "allow"
                                };
                            }
                        }
                    }
                }
                if !ok {
                    continue;
                }
            }
            match obj.get("value").or_else(|| obj.get("values")) {
                Some(Value::String(s)) => out.push(expand_arg_tokens(s, vars)),
                Some(Value::Array(arr)) => {
                    for v in arr {
                        if let Some(s) = v.as_str() {
                            out.push(expand_arg_tokens(s, vars));
                        }
                    }
                }
                _ => {}
            }
        }
    }
    out
}

fn reclaim_finished_process() {
    let mut guard = GAME_CHILD.lock().unwrap();
    if let Some(proc) = guard.as_mut() {
        match proc.child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
            }
            Ok(None) => {}
            Err(_) => {
                *guard = None;
            }
        }
    }
}

#[tauri::command]
pub fn get_launch_status() -> LaunchStatus {
    reclaim_finished_process();
    let guard = GAME_CHILD.lock().unwrap();
    match guard.as_ref() {
        Some(proc) => LaunchStatus {
            running: true,
            build_id: Some(proc.build_id.clone()),
            pid: Some(proc.child.id()),
            started_ms: Some(proc.started_ms),
            game_dir: Some(proc.game_dir.clone()),
        },
        None => LaunchStatus {
            running: false,
            build_id: None,
            pid: None,
            started_ms: None,
            game_dir: None,
        },
    }
}

#[tauri::command]
pub fn stop_minecraft() -> Result<(), String> {
    let mut guard = GAME_CHILD.lock().unwrap();
    if let Some(mut proc) = guard.take() {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
    Ok(())
}

fn spawn_exit_watcher(app: AppHandle) {
    if WATCHER_ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(750));
            let finished = {
                let mut guard = GAME_CHILD.lock().unwrap();
                match guard.as_mut() {
                    None => {
                        WATCHER_ACTIVE.store(false, Ordering::SeqCst);
                        return;
                    }
                    Some(proc) => match proc.child.try_wait() {
                        Ok(Some(status)) => {
                            let event = MinecraftExitEvent {
                                build_id: proc.build_id.clone(),
                                game_dir: proc.game_dir.clone(),
                                started_ms: proc.started_ms,
                                exit_code: status.code(),
                                killed: false,
                            };
                            *guard = None;
                            Some(event)
                        }
                        Ok(None) => None,
                        Err(_) => {
                            let event = MinecraftExitEvent {
                                build_id: proc.build_id.clone(),
                                game_dir: proc.game_dir.clone(),
                                started_ms: proc.started_ms,
                                exit_code: None,
                                killed: true,
                            };
                            *guard = None;
                            Some(event)
                        }
                    },
                }
            };
            if let Some(event) = finished {
                let _ = app.emit("minecraft-exit", &event);
                WATCHER_ACTIVE.store(false, Ordering::SeqCst);
                return;
            }
        }
    });
}

fn read_tail_bytes(path: &Path, max_bytes: usize) -> String {
    let Ok(meta) = fs::metadata(path) else {
        return String::new();
    };
    let Ok(mut file) = File::open(path) else {
        return String::new();
    };
    let len = meta.len() as usize;
    if len > max_bytes {
        use std::io::Seek;
        let _ = file.seek(std::io::SeekFrom::End(-(max_bytes as i64)));
    }
    let mut buf = String::new();
    let _ = file.read_to_string(&mut buf);
    buf
}

#[tauri::command]
pub fn read_instance_log_tail(
    game_dir: String,
    which: String,
    max_bytes: Option<u32>,
) -> Result<String, String> {
    let root = PathBuf::from(game_dir.trim());
    if !root.is_dir() {
        return Err("Instance folder not found".into());
    }
    let name = match which.trim() {
        "latest" | "latest.log" => "latest.log",
        "launch" | "cultforge-launch.log" => "cultforge-launch.log",
        other => {
            return Err(format!("Unknown log '{other}' (use latest or launch)"));
        }
    };
    let path = root.join("logs").join(name);
    if !path.is_file() {
        return Ok(String::new());
    }
    let cap = max_bytes.unwrap_or(64_000).clamp(2_000, 512_000) as usize;
    Ok(read_tail_bytes(&path, cap))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogEntry {
    pub name: String,
    pub path: String,
    pub modified_ms: u64,
    pub tail: String,
}

fn file_modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn collect_logs_in_dir(
    dir: &Path,
    started_ms: u64,
    cap: usize,
    out: &mut Vec<SessionLogEntry>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let threshold = started_ms.saturating_sub(5_000);
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let lower = name.to_ascii_lowercase();
        if !(lower.ends_with(".log") || lower.ends_with(".txt")) {
            continue;
        }
        let modified_ms = file_modified_ms(&path);
        if modified_ms < threshold {
            continue;
        }
        out.push(SessionLogEntry {
            name,
            path: path.to_string_lossy().to_string(),
            modified_ms,
            tail: read_tail_bytes(&path, cap),
        });
    }
}

#[tauri::command]
pub fn list_instance_session_logs(
    game_dir: String,
    started_ms: u64,
    max_bytes: Option<u32>,
) -> Result<Vec<SessionLogEntry>, String> {
    let root = PathBuf::from(game_dir.trim());
    if !root.is_dir() {
        return Err("Instance folder not found".into());
    }
    let cap = max_bytes.unwrap_or(48_000).clamp(2_000, 256_000) as usize;
    let mut out = Vec::new();
    collect_logs_in_dir(&root.join("logs"), started_ms, cap, &mut out);
    collect_logs_in_dir(&root.join("crash-reports"), started_ms, cap, &mut out);
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub hostname: Option<String>,
    pub app_version: String,
}

#[tauri::command]
pub fn system_snapshot() -> SystemSnapshot {
    SystemSnapshot {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        hostname: std::env::var("COMPUTERNAME")
            .ok()
            .or_else(|| std::env::var("HOSTNAME").ok()),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn write_crash_report(
    game_dir: String,
    filename: String,
    body: String,
) -> Result<String, String> {
    let root = PathBuf::from(game_dir.trim());
    if root.as_os_str().is_empty() {
        return Err("Missing game dir".into());
    }
    let safe_name = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    if safe_name.is_empty() || !safe_name.ends_with(".md") {
        return Err("Crash report filename must end with .md".into());
    }
    let dir = root.join("crash-reports");
    fs::create_dir_all(&dir).map_err(|e| format!("Create crash-reports: {e}"))?;
    let path = dir.join(&safe_name);
    fs::write(&path, body).map_err(|e| format!("Write crash report: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn minimize_to_tray(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn restore_from_tray(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn launch_minecraft(app: AppHandle, args: LaunchMinecraftArgs) -> Result<LaunchStatus, String> {
    reclaim_finished_process();
    {
        let guard = GAME_CHILD.lock().unwrap();
        if guard.is_some() {
            return Err("Minecraft is already running from CultForge.".into());
        }
    }

    let player = args.player_name.trim();
    if player.is_empty() {
        return Err("Player name is required to launch.".into());
    }
    let game_dir = PathBuf::from(args.game_dir.trim());
    if args.game_dir.trim().is_empty() {
        return Err("Missing CultForge instance game directory.".into());
    }
    fs::create_dir_all(&game_dir)
        .map_err(|e| format!("Failed to create game dir {}: {e}", game_dir.display()))?;

    let minecraft_root = args
        .minecraft_root
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_minecraft_root);

    let version_id = args.version_id.trim();
    if version_id.is_empty() {
        return Err("Missing Minecraft version id.".into());
    }

    let preferred_major = args
        .java_hint
        .as_deref()
        .and_then(|s| {
            let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse().ok()
        });
    let java = resolve_java(preferred_major)?;
    crate::windows_game::register_exe_as_game(&java.path);

    let profile = load_version_profile(&minecraft_root, version_id)?;
    let client_jar = minecraft_root
        .join("versions")
        .join(&profile.jar_id)
        .join(format!("{}.jar", profile.jar_id));

    let mut classpath: Vec<String> = Vec::new();
    let mut native_jars: Vec<PathBuf> = Vec::new();
    for lib in &profile.libraries {
        if let Some(p) = library_path_from_entry(&minecraft_root, lib) {
            if p.is_file() {
                classpath.push(p.to_string_lossy().to_string());
            }
        }
        if let Some(np) = native_jar_path(&minecraft_root, lib) {
            if np.is_file() {
                native_jars.push(np);
            }
        }
    }

    // Prefer the leaf versions/{id}/{id}.jar. Forge ignoreList includes
    // `${version_name}.jar` so that file stays off the module layer. Using the
    // inherited vanilla path (1.20.1.jar) instead creates module `_1._20._1` and
    // crashes with: Modules _1._20._1 and minecraft export package ... to module forge.
    // Do not also add forge-*-client — FML loads those via -DlibraryDirectory.
    let leaf_jar = leaf_jar_path(&minecraft_root, version_id);
    let game_jar = if leaf_jar.is_file() {
        leaf_jar
    } else if client_jar.is_file() {
        client_jar.clone()
    } else {
        return Err(format!(
            "Missing client jar for {}. Play this version once in the official launcher so jars/libraries are installed.",
            profile.jar_id
        ));
    };
    classpath.push(game_jar.to_string_lossy().to_string());

    let natives_dir = game_dir.join("natives");
    extract_natives(&natives_dir, &native_jars)?;

    let assets_root = minecraft_root.join("assets");
    let libraries_dir = minecraft_root.join("libraries");
    let classpath_sep = if cfg!(windows) { ";" } else { ":" };
    let classpath_joined = classpath.join(classpath_sep);
    let uuid = offline_uuid(player);
    let game_dir_s = game_dir.to_string_lossy().to_string();
    let natives_s = natives_dir.to_string_lossy().to_string();
    let assets_s = assets_root.to_string_lossy().to_string();
    // Forge templates use forward slashes after ${library_directory}.
    let libraries_s = libraries_dir.to_string_lossy().replace('\\', "/");

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("auth_player_name", player.to_string());
    vars.insert("auth_uuid", uuid.clone());
    vars.insert("auth_access_token", "0".into());
    vars.insert("auth_session", "0".into());
    vars.insert("user_type", "legacy".into());
    vars.insert("version_name", profile.id.clone());
    vars.insert("version_type", "release".into());
    vars.insert("game_directory", game_dir_s.clone());
    vars.insert("assets_root", assets_s.clone());
    vars.insert("game_assets", assets_s.clone());
    vars.insert("assets_index_name", profile.asset_index.clone());
    vars.insert("natives_directory", natives_s.clone());
    vars.insert("library_directory", libraries_s.clone());
    vars.insert("classpath_separator", classpath_sep.to_string());
    vars.insert("classpath", classpath_joined.clone());
    vars.insert("launcher_name", "CultForge".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("clientid", "cultforge".into());
    vars.insert("auth_xuid", "0".into());

    let width = args.width.unwrap_or(1280);
    let height = args.height.unwrap_or(720);
    vars.insert("resolution_width", width.to_string());
    vars.insert("resolution_height", height.to_string());
    let custom_res = args.width.is_some() || args.height.is_some();

    let mem_min = args.memory_min_mb.unwrap_or(2048);
    let mem_max = args.memory_max_mb.unwrap_or(4096).max(mem_min);

    let mut jvm_args: Vec<String> = vec![
        format!("-Xms{mem_min}M"),
        format!("-Xmx{mem_max}M"),
        format!("-Djava.library.path={natives_s}"),
        format!("-Djna.tmpdir={natives_s}"),
        format!("-Dorg.lwjgl.system.SharedLibraryExtractPath={natives_s}"),
        format!("-Dio.netty.native.workdir={natives_s}"),
    ];
    if let Some(extra) = args.jvm_args.as_deref() {
        for token in extra.split_whitespace() {
            if !token.is_empty() {
                jvm_args.push(token.to_string());
            }
        }
    }

    if !profile.arguments_jvm.is_empty() {
        jvm_args.extend(flatten_args(&profile.arguments_jvm, &vars, custom_res));
    } else {
        // Legacy classpath / natives already covered above.
        jvm_args.push("-cp".into());
        jvm_args.push(classpath_joined.clone());
    }
    // Ensure -cp present
    if !jvm_args.iter().any(|a| a == "-cp" || a == "-classpath") {
        jvm_args.push("-cp".into());
        jvm_args.push(classpath_joined.clone());
    }

    let mut game_args: Vec<String> = Vec::new();
    if !profile.arguments_game.is_empty() {
        game_args.extend(flatten_args(&profile.arguments_game, &vars, custom_res));
    } else if let Some(legacy) = &profile.minecraft_arguments {
        for token in legacy.split_whitespace() {
            game_args.push(expand_arg_tokens(token, &vars));
        }
    } else {
        game_args.extend([
            "--username".into(),
            player.to_string(),
            "--version".into(),
            profile.id.clone(),
            "--gameDir".into(),
            game_dir_s.clone(),
            "--assetsDir".into(),
            assets_s.clone(),
            "--assetIndex".into(),
            profile.asset_index.clone(),
            "--uuid".into(),
            uuid.clone(),
            "--accessToken".into(),
            "0".into(),
            "--userType".into(),
            "legacy".into(),
        ]);
    }

    if args.fullscreen.unwrap_or(false) {
        if !game_args.iter().any(|a| a == "--fullscreen") {
            game_args.push("--fullscreen".into());
        }
    }

    if args.dedicated_gpu.unwrap_or(false) {
        prefer_dedicated_gpu(&java.path);
    }

    let logs_dir = game_dir.join("logs");
    let _ = fs::create_dir_all(&logs_dir);
    let launch_log_path = logs_dir.join("cultforge-launch.log");
    {
        let mut log = File::create(&launch_log_path)
            .map_err(|e| format!("Failed to create launch log: {e}"))?;
        writeln!(log, "java={}", java.path).ok();
        writeln!(log, "version={}", profile.id).ok();
        writeln!(log, "mainClass={}", profile.main_class).ok();
        writeln!(log, "gameDir={}", game_dir_s).ok();
        writeln!(log, "jar={}", game_jar.display()).ok();
        writeln!(log, "classpathEntries={}", classpath.len()).ok();
        writeln!(log, "dedicatedGpu={}", args.dedicated_gpu.unwrap_or(false)).ok();
        writeln!(log, "wrapper={}", args.wrapper.as_deref().unwrap_or("")).ok();
        writeln!(log, "--- jvm ---").ok();
        for a in &jvm_args {
            writeln!(log, "{a}").ok();
        }
        writeln!(log, "--- main ---").ok();
        writeln!(log, "{}", profile.main_class).ok();
        writeln!(log, "--- game ---").ok();
        for a in &game_args {
            writeln!(log, "{a}").ok();
        }
        writeln!(log, "--- process ---").ok();
    }

    let log_out = File::options()
        .create(true)
        .append(true)
        .open(&launch_log_path)
        .map_err(|e| format!("Failed to open launch log: {e}"))?;
    let log_err = log_out
        .try_clone()
        .map_err(|e| format!("Failed to clone launch log: {e}"))?;

    let wrapper = args
        .wrapper
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let mut child = if let Some(wrapper_cmd) = wrapper {
        let mut parts = wrapper_cmd.split_whitespace();
        let prog = parts
            .next()
            .ok_or_else(|| "Wrapper command is empty".to_string())?;
        let mut cmd = Command::new(prog);
        cmd.args(parts)
            .arg(&java.path)
            .args(&jvm_args)
            .arg(&profile.main_class)
            .args(&game_args)
            .current_dir(&game_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_out))
            .stderr(Stdio::from(log_err));
        cmd.spawn()
            .map_err(|e| format!("Failed to spawn Minecraft via wrapper: {e}"))?
    } else {
        let mut cmd = Command::new(&java.path);
        cmd.args(&jvm_args)
            .arg(&profile.main_class)
            .args(&game_args)
            .current_dir(&game_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_out))
            .stderr(Stdio::from(log_err));
        cmd.spawn()
            .map_err(|e| format!("Failed to spawn Minecraft: {e}"))?
    };

    // Forge/vanilla often crash in <1s when classpath/module-path is wrong.
    std::thread::sleep(std::time::Duration::from_millis(1800));
    match child.try_wait() {
        Ok(Some(exit)) => {
            let tail = fs::read_to_string(&launch_log_path).unwrap_or_default();
            let snippet: String = tail
                .lines()
                .rev()
                .take(12)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n");
            return Err(format!(
                "Minecraft exited immediately ({exit}). Check logs/cultforge-launch.log.\n{snippet}"
            ));
        }
        Ok(None) => {}
        Err(e) => {
            return Err(format!("Failed to check Minecraft process: {e}"));
        }
    }

    let status = LaunchStatus {
        running: true,
        build_id: Some(args.build_id.clone()),
        pid: Some(child.id()),
        started_ms: Some(now_ms()),
        game_dir: Some(game_dir_s.clone()),
    };

    *GAME_CHILD.lock().unwrap() = Some(GameProcess {
        child,
        build_id: args.build_id,
        game_dir: game_dir_s,
        started_ms: status.started_ms.unwrap_or(0),
    });

    spawn_exit_watcher(app);
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forge_tokens_expand() {
        let root = default_minecraft_root();
        let version = "1.20.1-forge-47.4.20";
        let profile = match load_version_profile(&root, version) {
            Ok(p) => p,
            Err(_) => return, // skip when MC not installed on CI
        };
        assert_eq!(profile.id, version);
        assert!(profile.main_class.contains("BootstrapLauncher"));

        let mut vars = HashMap::new();
        vars.insert("library_directory", root.join("libraries").to_string_lossy().replace('\\', "/"));
        vars.insert("classpath_separator", ";".into());
        vars.insert("version_name", version.into());
        vars.insert("natives_directory", "natives".into());
        vars.insert("classpath", "cp".into());
        vars.insert("launcher_name", "CultForge".into());
        vars.insert("launcher_version", "0".into());

        let jvm = flatten_args(&profile.arguments_jvm, &vars, false);
        let joined = jvm.join("\n");
        assert!(
            !joined.contains("${library_directory}"),
            "library_directory must be expanded"
        );
        assert!(
            !joined.contains("${classpath_separator}"),
            "classpath_separator must be expanded"
        );
        assert!(joined.contains("-p"), "Forge module path -p required");
    }
}
