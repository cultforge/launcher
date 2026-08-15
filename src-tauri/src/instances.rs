//! Per-build CultForge instances under `%APPDATA%/CultForge/instances/{buildId}/`.

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const ALL_CONTENT_DIRS: &[&str] = &[
    "mods",
    "resourcepacks",
    "shaderpacks",
    "datapacks",
    "saves",
    "config",
];

const VANILLA_DIRS: &[&str] = &["resourcepacks", "datapacks", "saves"];
const OPTIFINE_DIRS: &[&str] = &["resourcepacks", "datapacks", "saves", "shaderpacks"];
const MODDED_DIRS: &[&str] = &[
    "mods",
    "resourcepacks",
    "shaderpacks",
    "datapacks",
    "saves",
    "config",
];

/// Folders skipped when duplicating (regenerable / large).
const SKIP_ON_COPY: &[&str] = &["natives", "logs", "crash-reports"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LoaderProfile {
    Vanilla,
    OptiFine,
    Modded,
}

fn loader_profile(loader: &str) -> LoaderProfile {
    match loader.trim().to_ascii_lowercase().as_str() {
        "" | "vanilla" => LoaderProfile::Vanilla,
        "optifine" => LoaderProfile::OptiFine,
        _ => LoaderProfile::Modded,
    }
}

fn content_dirs_for_loader(loader: &str) -> &'static [&'static str] {
    match loader_profile(loader) {
        LoaderProfile::Vanilla => VANILLA_DIRS,
        LoaderProfile::OptiFine => OPTIFINE_DIRS,
        LoaderProfile::Modded => MODDED_DIRS,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInstanceRoot {
    pub build_id: String,
    pub path: String,
    pub created: bool,
    pub loader: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPackResult {
    pub path: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPackArgs {
    pub build_id: String,
    pub pack_name: String,
    pub include_mods: bool,
    pub include_config: bool,
    pub include_worlds: bool,
}

pub fn default_instances_root() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("CultForge").join("instances");
    }
    PathBuf::from("CultForge").join("instances")
}

fn default_exports_root() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("CultForge").join("exports");
    }
    PathBuf::from("CultForge").join("exports")
}

fn default_cultforge_root() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("CultForge");
    }
    PathBuf::from("CultForge")
}

/// Sanitize a Minecraft version / build id into a single safe folder name.
pub fn sanitize_build_id(build_id: &str) -> Result<String, String> {
    let trimmed = build_id.trim();
    if trimmed.is_empty() {
        return Err("Missing build id".into());
    }
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '+') {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() || out == "." || out == ".." {
        return Err("Invalid build id".into());
    }
    if out.len() > 120 {
        out.truncate(120);
    }
    Ok(out)
}

fn sanitize_export_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Pack name is required".into());
    }
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ' ') {
            out.push(if ch == ' ' { '_' } else { ch });
        }
    }
    let out = out.trim_matches('_').to_string();
    if out.is_empty() {
        return Err("Pack name is invalid".into());
    }
    if out.len() > 80 {
        return Ok(out[..80].to_string());
    }
    Ok(out)
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Failed to create {}: {e}", path.display()))
}

fn is_dir_empty(path: &Path) -> bool {
    match fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => false,
    }
}

fn prune_unused_empty_dirs(root: &Path, keep: &[&str]) {
    for name in ALL_CONTENT_DIRS {
        if keep.contains(name) {
            continue;
        }
        let path = root.join(name);
        if path.is_dir() && is_dir_empty(&path) {
            let _ = fs::remove_dir(&path);
        }
    }
}

pub fn ensure_instance_dir(build_id: &str, loader: &str) -> Result<(PathBuf, bool), String> {
    let safe = sanitize_build_id(build_id)?;
    let root = default_instances_root().join(&safe);
    let created = !root.exists();
    ensure_dir(&root)?;
    let dirs = content_dirs_for_loader(loader);
    for name in dirs {
        ensure_dir(&root.join(name))?;
    }
    prune_unused_empty_dirs(&root, dirs);
    Ok((root, created))
}

#[tauri::command]
pub fn get_instances_root() -> String {
    default_instances_root().to_string_lossy().to_string()
}

#[tauri::command]
pub fn ensure_build_instance(
    build_id: String,
    loader: Option<String>,
) -> Result<BuildInstanceRoot, String> {
    let loader = loader.unwrap_or_else(|| "Vanilla".into());
    let (path, created) = ensure_instance_dir(&build_id, &loader)?;
    let safe = sanitize_build_id(&build_id)?;
    Ok(BuildInstanceRoot {
        build_id: safe,
        path: path.to_string_lossy().to_string(),
        created,
        loader,
    })
}

pub fn is_under_instances(path: &Path) -> bool {
    let Ok(instances) = default_instances_root().canonicalize() else {
        return false;
    };
    let candidate = if path.exists() {
        path.canonicalize().ok()
    } else {
        path.parent()
            .and_then(|p| p.canonicalize().ok())
            .map(|p| p.join(path.file_name().unwrap_or_default()))
    };
    match candidate {
        Some(c) => c.starts_with(&instances),
        None => false,
    }
}

fn path_allowed_for_open(path: &Path) -> bool {
    let instances = default_instances_root();
    let exports = default_exports_root();
    if path.starts_with(&instances) || path.starts_with(&exports) {
        return true;
    }
    if let (Ok(canon), Ok(inst)) = (path.canonicalize(), instances.canonicalize()) {
        if canon.starts_with(&inst) {
            return true;
        }
    }
    if let (Ok(canon), Ok(exp)) = (path.canonicalize(), exports.canonicalize()) {
        if canon.starts_with(&exp) {
            return true;
        }
    }
    let _ = default_cultforge_root();
    false
}

fn open_in_os_file_manager(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("explorer").arg(path.as_os_str()).spawn();
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
        Ok(())
    }
}

#[tauri::command]
pub fn open_instance_folder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Missing folder path".into());
    }
    let p = PathBuf::from(trimmed);
    if !path_allowed_for_open(&p) {
        return Err("Can only open CultForge instance or export folders".into());
    }
    if !p.exists() {
        ensure_dir(&p)?;
    }
    open_in_os_file_manager(&p)
}

fn copy_dir_filtered(src: &Path, dst: &Path) -> Result<u64, String> {
    ensure_dir(dst)?;
    let mut bytes: u64 = 0;
    let entries =
        fs::read_dir(src).map_err(|e| format!("Read {}: {e}", src.display()))?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if SKIP_ON_COPY.iter().any(|s| *s == name_str) {
            continue;
        }
        if name_str == "." || name_str == ".." {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        let ft = entry
            .file_type()
            .map_err(|e| format!("Stat {}: {e}", from.display()))?;
        if ft.is_dir() {
            bytes += copy_dir_filtered(&from, &to)?;
        } else if ft.is_file() {
            if let Some(parent) = to.parent() {
                ensure_dir(parent)?;
            }
            fs::copy(&from, &to).map_err(|e| format!("Copy {}: {e}", from.display()))?;
            bytes += fs::metadata(&to).map(|m| m.len()).unwrap_or(0);
        }
    }
    Ok(bytes)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateIncludes {
    #[serde(default = "default_true")]
    pub full: bool,
    #[serde(default = "default_true")]
    pub mods: bool,
    #[serde(default = "default_true")]
    pub resourcepacks: bool,
    #[serde(default = "default_true")]
    pub shaderpacks: bool,
    #[serde(default = "default_true")]
    pub config: bool,
    #[serde(default = "default_true")]
    pub worlds: bool,
}

fn default_true() -> bool {
    true
}

fn copy_named_dir(src_root: &Path, dst_root: &Path, name: &str) -> Result<u64, String> {
    let from = src_root.join(name);
    if !from.is_dir() {
        return Ok(0);
    }
    copy_dir_filtered(&from, &dst_root.join(name))
}

fn copy_file_if_exists(src: &Path, dst: &Path) -> Result<u64, String> {
    if !src.is_file() {
        return Ok(0);
    }
    if let Some(parent) = dst.parent() {
        ensure_dir(parent)?;
    }
    fs::copy(src, dst).map_err(|e| format!("Copy {}: {e}", src.display()))?;
    Ok(fs::metadata(dst).map(|m| m.len()).unwrap_or(0))
}

#[tauri::command]
pub fn duplicate_build_instance(
    source_build_id: String,
    dest_build_id: String,
    loader: Option<String>,
    includes: Option<DuplicateIncludes>,
) -> Result<BuildInstanceRoot, String> {
    let loader = loader.unwrap_or_else(|| "Vanilla".into());
    let includes = includes.unwrap_or(DuplicateIncludes {
        full: true,
        mods: true,
        resourcepacks: true,
        shaderpacks: true,
        config: true,
        worlds: true,
    });
    let source_safe = sanitize_build_id(&source_build_id)?;
    let dest_safe = sanitize_build_id(&dest_build_id)?;
    if source_safe == dest_safe {
        return Err("Source and destination build ids must differ".into());
    }
    let source = default_instances_root().join(&source_safe);
    if !source.is_dir() {
        return Err(format!(
            "Source instance folder not found: {}",
            source.display()
        ));
    }
    let (dest, created) = ensure_instance_dir(&dest_safe, &loader)?;
    if includes.full {
        let _ = copy_dir_filtered(&source, &dest)?;
    } else {
        if includes.mods {
            let _ = copy_named_dir(&source, &dest, "mods")?;
        }
        if includes.resourcepacks {
            let _ = copy_named_dir(&source, &dest, "resourcepacks")?;
        }
        if includes.shaderpacks {
            let _ = copy_named_dir(&source, &dest, "shaderpacks")?;
        }
        if includes.worlds {
            let _ = copy_named_dir(&source, &dest, "saves")?;
        }
        if includes.config {
            let _ = copy_named_dir(&source, &dest, "config")?;
            let _ = copy_file_if_exists(
                &source.join("options.txt"),
                &dest.join("options.txt"),
            )?;
            let _ = copy_named_dir(&source, &dest, "cultforge")?;
        }
    }
    Ok(BuildInstanceRoot {
        build_id: dest_safe,
        path: dest.to_string_lossy().to_string(),
        created,
        loader,
    })
}

const ALLOWED_IMPORT_DEST: &[&str] = &["resourcepacks", "shaderpacks", "mods", "datapacks"];

#[tauri::command]
pub fn open_instance_subdir(build_id: String, subdir: String) -> Result<(), String> {
    let safe = sanitize_build_id(&build_id)?;
    let kind = subdir.trim().to_ascii_lowercase();
    if !ALLOWED_IMPORT_DEST.iter().any(|s| *s == kind) && kind != "saves" {
        return Err(format!("Unsupported subdir: {subdir}"));
    }
    let root = default_instances_root().join(&safe).join(&kind);
    ensure_dir(&root)?;
    if !path_allowed_for_open(&root) {
        return Err("Can only open CultForge instance folders".into());
    }
    open_in_os_file_manager(&root)
}

#[tauri::command]
pub fn pick_content_files(kind: String) -> Result<Vec<String>, String> {
    let kind = kind.trim().to_ascii_lowercase();
    let title = match kind.as_str() {
        "resourcepacks" => "Add resource packs",
        "shaderpacks" => "Add shader packs",
        "mods" => "Add mods",
        _ => "Add content files",
    };
    let files = rfd::FileDialog::new()
        .set_title(title)
        .add_filter("Zip / jar", &["zip", "jar"])
        .add_filter("All files", &["*"])
        .pick_files();
    Ok(files
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub fn import_instance_files(
    build_id: String,
    dest_kind: String,
    paths: Vec<String>,
) -> Result<u32, String> {
    let kind = dest_kind.trim().to_ascii_lowercase();
    if !ALLOWED_IMPORT_DEST.iter().any(|s| *s == kind) {
        return Err(format!("Unsupported dest kind: {dest_kind}"));
    }
    let safe = sanitize_build_id(&build_id)?;
    let dest_dir = default_instances_root().join(&safe).join(&kind);
    ensure_dir(&dest_dir)?;
    let mut count = 0u32;
    for raw in paths {
        let src = PathBuf::from(raw.trim());
        if !src.exists() {
            continue;
        }
        let name = src
            .file_name()
            .ok_or_else(|| format!("Invalid path: {}", src.display()))?;
        let dest = dest_dir.join(name);
        if src.is_dir() {
            let _ = copy_dir_filtered(&src, &dest)?;
            count += 1;
        } else if src.is_file() {
            if dest.exists() {
                let _ = fs::remove_file(&dest);
            }
            fs::copy(&src, &dest).map_err(|e| format!("Copy {}: {e}", src.display()))?;
            count += 1;
        }
    }
    Ok(count)
}

fn zip_add_file(
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    base: &Path,
    file: &Path,
) -> Result<u64, String> {
    let rel = file
        .strip_prefix(base)
        .map_err(|_| format!("Path outside pack root: {}", file.display()))?;
    let name = rel.to_string_lossy().replace('\\', "/");
    zip.start_file(name, options)
        .map_err(|e| format!("Zip start file: {e}"))?;
    let mut f = File::open(file).map_err(|e| format!("Open {}: {e}", file.display()))?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)
        .map_err(|e| format!("Read {}: {e}", file.display()))?;
    zip.write_all(&buf)
        .map_err(|e| format!("Write zip entry: {e}"))?;
    Ok(buf.len() as u64)
}

fn zip_add_dir(
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    base: &Path,
    dir: &Path,
) -> Result<u64, String> {
    if !dir.is_dir() {
        return Ok(0);
    }
    let mut total = 0u64;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current)
            .map_err(|e| format!("Read {}: {e}", current.display()))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let ft = entry.file_type().map_err(|e| format!("Stat: {e}"))?;
            if ft.is_dir() {
                stack.push(path);
            } else if ft.is_file() {
                total += zip_add_file(zip, options, base, &path)?;
            }
        }
    }
    Ok(total)
}

#[tauri::command]
pub fn export_build_pack(args: ExportPackArgs) -> Result<ExportPackResult, String> {
    let safe = sanitize_build_id(&args.build_id)?;
    let instance = default_instances_root().join(&safe);
    if !instance.is_dir() {
        return Err(format!("Instance not found: {}", instance.display()));
    }
    if !args.include_mods && !args.include_config && !args.include_worlds {
        return Err("Select at least one of Mods, Config, or Worlds".into());
    }
    let pack_name = sanitize_export_name(&args.pack_name)?;
    let exports = default_exports_root();
    ensure_dir(&exports)?;
    let out_path = exports.join(format!("{pack_name}.zip"));
    if out_path.exists() {
        let _ = fs::remove_file(&out_path);
    }

    let file =
        File::create(&out_path).map_err(|e| format!("Create {}: {e}", out_path.display()))?;
    let mut zip = ZipWriter::new(file);
    let options =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut bytes = 0u64;
    if args.include_mods {
        bytes += zip_add_dir(&mut zip, options, &instance, &instance.join("mods"))?;
    }
    if args.include_config {
        bytes += zip_add_dir(&mut zip, options, &instance, &instance.join("config"))?;
        let options_txt = instance.join("options.txt");
        if options_txt.is_file() {
            bytes += zip_add_file(&mut zip, options, &instance, &options_txt)?;
        }
    }
    if args.include_worlds {
        bytes += zip_add_dir(&mut zip, options, &instance, &instance.join("saves"))?;
    }

    zip.finish().map_err(|e| format!("Finalize zip: {e}"))?;

    let size = fs::metadata(&out_path).map(|m| m.len()).unwrap_or(bytes);
    Ok(ExportPackResult {
        path: out_path.to_string_lossy().to_string(),
        bytes: size,
    })
}
