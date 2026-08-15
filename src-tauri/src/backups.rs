//! Local zip backups under `%APPDATA%/CultForge/backups/{buildId}/`.

use serde::Serialize;
use std::fs::{self, File};
use std::io::{copy, BufWriter};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::instances::{default_instances_root, sanitize_build_id};

const MAX_BACKUPS: usize = 5;
const SKIP_BACKUP: &[&str] = &[
    "natives",
    "logs",
    "crash-reports",
    ".cultforge-cache",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub path: String,
    pub created_ms: u64,
    pub size_bytes: u64,
}

fn cultforge_root() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("CultForge");
    }
    PathBuf::from("CultForge")
}

fn backups_root(build_id: &str) -> Result<PathBuf, String> {
    let safe = sanitize_build_id(build_id)?;
    Ok(cultforge_root().join("backups").join(safe))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Create {}: {e}", path.display()))
}

fn should_skip(name: &str) -> bool {
    SKIP_BACKUP.iter().any(|s| *s == name) || name == "." || name == ".."
}

fn compression_for(path: &Path) -> CompressionMethod {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "jar" | "zip" | "png" | "jpg" | "jpeg" | "webp" | "gif" | "ogg" | "mp3"
        | "gz" | "tgz" | "7z" | "rar" | "zst" | "lz4" => CompressionMethod::Stored,
        _ => CompressionMethod::Deflated,
    }
}

fn zip_add_file(
    zip: &mut ZipWriter<BufWriter<File>>,
    base: &Path,
    file: &Path,
) -> Result<u64, String> {
    let rel = file
        .strip_prefix(base)
        .map_err(|_| format!("Path outside instance: {}", file.display()))?;
    let name = rel.to_string_lossy().replace('\\', "/");
    let size = fs::metadata(file)
        .map(|m| m.len())
        .unwrap_or(0);
    let options = SimpleFileOptions::default()
        .compression_method(compression_for(file))
        .large_file(size >= 0xFFFF_FFFF);
    zip.start_file(name, options)
        .map_err(|e| format!("Zip start: {e}"))?;
    let mut src = File::open(file).map_err(|e| format!("Open {}: {e}", file.display()))?;
    copy(&mut src, zip).map_err(|e| format!("Copy {}: {e}", file.display()))?;
    Ok(size)
}

fn zip_add_dir_filtered(
    zip: &mut ZipWriter<BufWriter<File>>,
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
                let top = path
                    .strip_prefix(base)
                    .ok()
                    .and_then(|p| p.components().next())
                    .map(|c| c.as_os_str().to_string_lossy().to_string());
                if let Some(ref t) = top {
                    if SKIP_BACKUP.iter().any(|s| *s == t.as_str()) {
                        continue;
                    }
                }
                stack.push(path);
            } else if ft.is_file() {
                total += zip_add_file(zip, base, &path)?;
            }
        }
    }
    Ok(total)
}

fn list_zip_backups(dir: &Path) -> Result<Vec<BackupInfo>, String> {
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("Read backups: {e}"))? {
        let entry = entry.map_err(|e| format!("Read entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if !name.ends_with(".zip") {
            continue;
        }
        let meta = fs::metadata(&path).map_err(|e| format!("Stat backup: {e}"))?;
        let created_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let id = name.trim_end_matches(".zip").to_string();
        out.push(BackupInfo {
            id,
            path: path.to_string_lossy().to_string(),
            created_ms,
            size_bytes: meta.len(),
        });
    }
    out.sort_by(|a, b| b.created_ms.cmp(&a.created_ms));
    Ok(out)
}

fn prune_old(dir: &Path) -> Result<(), String> {
    let list = list_zip_backups(dir)?;
    for old in list.into_iter().skip(MAX_BACKUPS) {
        let _ = fs::remove_file(&old.path);
    }
    Ok(())
}

#[tauri::command]
pub fn list_build_backups(build_id: String) -> Result<Vec<BackupInfo>, String> {
    let root = backups_root(&build_id)?;
    list_zip_backups(&root)
}

#[tauri::command]
pub async fn create_build_backup(
    build_id: String,
    worlds_only: Option<bool>,
) -> Result<BackupInfo, String> {
    tokio::task::spawn_blocking(move || create_build_backup_sync(build_id, worlds_only))
        .await
        .map_err(|e| format!("Backup task failed: {e}"))?
}

fn create_build_backup_sync(
    build_id: String,
    worlds_only: Option<bool>,
) -> Result<BackupInfo, String> {
    let safe = sanitize_build_id(&build_id)?;
    let instance = default_instances_root().join(&safe);
    if !instance.is_dir() {
        return Err(format!("Instance not found: {}", instance.display()));
    }
    let root = backups_root(&build_id)?;
    ensure_dir(&root)?;
    let worlds_only = worlds_only.unwrap_or(false);
    let id = if worlds_only {
        format!("worlds-{}", now_ms())
    } else {
        format!("backup-{}", now_ms())
    };
    let out_path = root.join(format!("{id}.zip"));
    let write_result = (|| {
        let file = File::create(&out_path)
            .map_err(|e| format!("Create {}: {e}", out_path.display()))?;
        let mut zip = ZipWriter::new(BufWriter::new(file));
        if worlds_only {
            let saves = instance.join("saves");
            if !saves.is_dir() {
                return Err("No worlds folder (saves/) in this instance".into());
            }
            let _ = zip_add_dir_filtered(&mut zip, &instance, &saves)?;
        } else {
            let _ = zip_add_dir_filtered(&mut zip, &instance, &instance)?;
        }
        zip.finish().map_err(|e| format!("Finalize zip: {e}"))?;
        Ok(())
    })();
    if let Err(err) = write_result {
        let _ = fs::remove_file(&out_path);
        return Err(err);
    }
    prune_old(&root)?;
    let meta = fs::metadata(&out_path).map_err(|e| format!("Stat backup: {e}"))?;
    Ok(BackupInfo {
        id,
        path: out_path.to_string_lossy().to_string(),
        created_ms: now_ms(),
        size_bytes: meta.len(),
    })
}

fn clear_instance_contents(instance: &Path) -> Result<(), String> {
    if !instance.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(instance).map_err(|e| format!("Read instance: {e}"))? {
        let entry = entry.map_err(|e| format!("Read entry: {e}"))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if should_skip(&name_str) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Remove {}: {e}", path.display()))?;
        } else {
            fs::remove_file(&path).map_err(|e| format!("Remove {}: {e}", path.display()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn restore_build_backup(build_id: String, backup_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || restore_build_backup_sync(build_id, backup_id))
        .await
        .map_err(|e| format!("Restore task failed: {e}"))?
}

fn restore_build_backup_sync(build_id: String, backup_id: String) -> Result<(), String> {
    let safe = sanitize_build_id(&build_id)?;
    let instance = default_instances_root().join(&safe);
    if !instance.is_dir() {
        return Err(format!("Instance not found: {}", instance.display()));
    }
    let root = backups_root(&build_id)?;
    let backup_safe = backup_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    let zip_path = root.join(format!("{backup_safe}.zip"));
    if !zip_path.is_file() {
        return Err(format!("Backup not found: {}", zip_path.display()));
    }

    clear_instance_contents(&instance)?;

    let file = File::open(&zip_path).map_err(|e| format!("Open backup: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Read zip: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry: {e}"))?;
        let name = entry
            .enclosed_name()
            .ok_or_else(|| "Unsafe zip entry path".to_string())?
            .to_path_buf();
        let out = instance.join(&name);
        if entry.is_dir() {
            ensure_dir(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            ensure_dir(parent)?;
        }
        let mut outfile =
            File::create(&out).map_err(|e| format!("Create {}: {e}", out.display()))?;
        std::io::copy(&mut entry, &mut outfile)
            .map_err(|e| format!("Extract {}: {e}", out.display()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_build_backup(build_id: String, backup_id: String) -> Result<(), String> {
    let root = backups_root(&build_id)?;
    let backup_safe = backup_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    let zip_path = root.join(format!("{backup_safe}.zip"));
    if !zip_path.is_file() {
        return Err("Backup not found".into());
    }
    fs::remove_file(&zip_path).map_err(|e| format!("Delete backup: {e}"))
}
