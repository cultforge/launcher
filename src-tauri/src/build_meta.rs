//! Per-instance CultForge metadata: notes, launch config, playtime.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::instances::{default_instances_root, ensure_instance_dir, sanitize_build_id};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedBuildConfig {
    pub memory_min_gb: f64,
    pub memory_max_gb: f64,
    pub jvm_args: String,
    pub wrapper: String,
    pub resolution: String,
    pub fullscreen: bool,
    pub close_on_launch: bool,
    pub dedicated_gpu: bool,
    #[serde(default)]
    pub playtime_minutes: f64,
    #[serde(default)]
    pub last_played_ms: u64,
}

impl Default for PersistedBuildConfig {
    fn default() -> Self {
        Self {
            memory_min_gb: 4.0,
            memory_max_gb: 8.0,
            jvm_args: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20"
                .into(),
            wrapper: String::new(),
            resolution: "1920x1080".into(),
            fullscreen: false,
            close_on_launch: false,
            dedicated_gpu: true,
            playtime_minutes: 0.0,
            last_played_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildMetaSnapshot {
    pub notes: String,
    pub config: PersistedBuildConfig,
}

fn cultforge_dir(instance: &Path) -> PathBuf {
    instance.join("cultforge")
}

fn notes_path(instance: &Path) -> PathBuf {
    cultforge_dir(instance).join("notes.md")
}

fn config_path(instance: &Path) -> PathBuf {
    cultforge_dir(instance).join("config.json")
}

fn resolve_instance(build_id: &str) -> Result<PathBuf, String> {
    let safe = sanitize_build_id(build_id)?;
    let root = default_instances_root().join(&safe);
    if !root.is_dir() {
        let (path, _) = ensure_instance_dir(build_id, "Vanilla")?;
        return Ok(path);
    }
    Ok(root)
}

fn ensure_meta_dir(instance: &Path) -> Result<(), String> {
    fs::create_dir_all(cultforge_dir(instance))
        .map_err(|e| format!("Failed to create cultforge meta dir: {e}"))
}

#[tauri::command]
pub fn read_build_notes(build_id: String) -> Result<String, String> {
    let instance = resolve_instance(&build_id)?;
    let path = notes_path(&instance);
    if !path.is_file() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("Read notes: {e}"))
}

#[tauri::command]
pub fn write_build_notes(build_id: String, notes: String) -> Result<(), String> {
    let instance = resolve_instance(&build_id)?;
    ensure_meta_dir(&instance)?;
    fs::write(notes_path(&instance), notes).map_err(|e| format!("Write notes: {e}"))
}

#[tauri::command]
pub fn read_build_config(build_id: String) -> Result<PersistedBuildConfig, String> {
    let instance = resolve_instance(&build_id)?;
    let path = config_path(&instance);
    if !path.is_file() {
        return Ok(PersistedBuildConfig::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Read config: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Parse config: {e}"))
}

#[tauri::command]
pub fn write_build_config(build_id: String, config: PersistedBuildConfig) -> Result<(), String> {
    let instance = resolve_instance(&build_id)?;
    ensure_meta_dir(&instance)?;
    let raw = serde_json::to_string_pretty(&config).map_err(|e| format!("Serialize config: {e}"))?;
    fs::write(config_path(&instance), raw).map_err(|e| format!("Write config: {e}"))
}

#[tauri::command]
pub fn read_build_meta(build_id: String) -> Result<BuildMetaSnapshot, String> {
    Ok(BuildMetaSnapshot {
        notes: read_build_notes(build_id.clone())?,
        config: read_build_config(build_id)?,
    })
}

#[tauri::command]
pub fn add_build_playtime_minutes(build_id: String, minutes: f64) -> Result<PersistedBuildConfig, String> {
    let mut config = read_build_config(build_id.clone())?;
    if minutes.is_finite() && minutes > 0.0 {
        config.playtime_minutes = (config.playtime_minutes + minutes).max(0.0);
    }
    write_build_config(build_id, config.clone())?;
    Ok(config)
}

#[tauri::command]
pub fn touch_build_last_played(build_id: String) -> Result<PersistedBuildConfig, String> {
    let mut config = read_build_config(build_id.clone())?;
    config.last_played_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    write_build_config(build_id, config.clone())?;
    Ok(config)
}
