//! Read/write per-build `options.txt` and toggle mods via `.disabled` rename.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsEntry {
    /// Empty when `kind` is `"raw"` (blank / non key:value line).
    pub key: String,
    pub value: String,
    /// `"entry"` or `"raw"`.
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsFile {
    pub path: String,
    pub exists: bool,
    pub entries: Vec<OptionsEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetEnabledResult {
    pub path: String,
    pub file_name: String,
    pub enabled: bool,
}

fn resolve_root(root: &str) -> Result<PathBuf, String> {
    let trimmed = root.trim();
    if trimmed.is_empty() {
        return Err("Missing build instance root".into());
    }
    Ok(PathBuf::from(trimmed))
}

fn options_path(root: &Path) -> PathBuf {
    root.join("options.txt")
}

/// Ensure `candidate` resolves under `allowed_root`.
fn path_under(candidate: &Path, allowed_root: &Path) -> Result<PathBuf, String> {
    let allowed = if allowed_root.exists() {
        allowed_root
            .canonicalize()
            .map_err(|e| format!("Failed to resolve {}: {e}", allowed_root.display()))?
    } else {
        allowed_root.to_path_buf()
    };

    let path = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|e| format!("Failed to resolve {}: {e}", candidate.display()))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| "Invalid path".to_string())?;
        let parent_canon = parent
            .canonicalize()
            .map_err(|e| format!("Failed to resolve {}: {e}", parent.display()))?;
        parent_canon.join(
            candidate
                .file_name()
                .ok_or_else(|| "Invalid path".to_string())?,
        )
    };

    if !path.starts_with(&allowed) {
        return Err(format!(
            "Path {} is outside allowed directory {}",
            path.display(),
            allowed.display()
        ));
    }
    Ok(path)
}

fn is_disabled_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".disabled")
}

fn strip_disabled_suffix(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".disabled") {
        name[..name.len() - ".disabled".len()].to_string()
    } else {
        name.to_string()
    }
}

fn parse_options_text(text: &str) -> Vec<OptionsEntry> {
    let mut entries = Vec::new();
    for line in text.lines() {
        if let Some((key, value)) = line.split_once(':') {
            if key.is_empty() {
                entries.push(OptionsEntry {
                    key: String::new(),
                    value: line.to_string(),
                    kind: "raw".into(),
                });
            } else {
                entries.push(OptionsEntry {
                    key: key.to_string(),
                    value: value.to_string(),
                    kind: "entry".into(),
                });
            }
        } else {
            entries.push(OptionsEntry {
                key: String::new(),
                value: line.to_string(),
                kind: "raw".into(),
            });
        }
    }
    entries
}

fn serialize_options(entries: &[OptionsEntry]) -> String {
    let mut out = String::new();
    for (i, entry) in entries.iter().enumerate() {
        if i > 0 {
            out.push('\n');
        }
        if entry.kind == "raw" || entry.key.is_empty() {
            out.push_str(&entry.value);
        } else {
            out.push_str(&entry.key);
            out.push(':');
            out.push_str(&entry.value);
        }
    }
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "options.txt has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;

    let tmp = parent.join(format!("options.txt.{}.part", std::process::id()));
    {
        let mut file = fs::File::create(&tmp)
            .map_err(|e| format!("Failed to create temp options file: {e}"))?;
        file.write_all(contents.as_bytes())
            .map_err(|e| format!("Failed to write temp options file: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("Failed to sync temp options file: {e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Failed to replace options.txt (is Minecraft running?): {e}")
    })?;
    Ok(())
}

fn load_entries(root: &Path) -> Result<(PathBuf, bool, Vec<OptionsEntry>), String> {
    let path = options_path(root);
    if !path.exists() {
        return Ok((path, false, Vec::new()));
    }
    let text = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    Ok((path, true, parse_options_text(&text)))
}

fn get_entry_value<'a>(entries: &'a [OptionsEntry], key: &str) -> Option<&'a str> {
    entries
        .iter()
        .rev()
        .find(|e| e.kind == "entry" && e.key == key)
        .map(|e| e.value.as_str())
}

fn set_entry_value(entries: &mut Vec<OptionsEntry>, key: &str, value: String) {
    if let Some(existing) = entries
        .iter_mut()
        .rev()
        .find(|e| e.kind == "entry" && e.key == key)
    {
        existing.value = value;
        return;
    }
    entries.push(OptionsEntry {
        key: key.to_string(),
        value,
        kind: "entry".into(),
    });
}

/// Parse Minecraft `resourcePacks:["a","b"]` list (lenient).
fn parse_resource_packs_list(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(trimmed) {
        return arr
            .into_iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
    }
    let mut out = Vec::new();
    let mut chars = trimmed.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '"' {
            let mut s = String::new();
            while let Some(ch) = chars.next() {
                if ch == '\\' {
                    if let Some(next) = chars.next() {
                        s.push(next);
                    }
                } else if ch == '"' {
                    break;
                } else {
                    s.push(ch);
                }
            }
            out.push(s);
        }
    }
    out
}

fn serialize_resource_packs_list(packs: &[String]) -> String {
    let escaped: Vec<String> = packs
        .iter()
        .map(|p| format!("\"{}\"", p.replace('\\', "\\\\").replace('"', "\\\"")))
        .collect();
    format!("[{}]", escaped.join(","))
}

fn pack_options_entry(file_name: &str) -> String {
    let name = strip_disabled_suffix(file_name);
    if name.contains('/') || name.contains('\\') {
        return name;
    }
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".zip") || lower.ends_with(".jar") {
        format!("file/{name}")
    } else {
        name
    }
}

fn pack_entry_matches(entry: &str, file_name: &str) -> bool {
    let want = pack_options_entry(file_name);
    if entry == want {
        return true;
    }
    let stem = strip_disabled_suffix(file_name);
    let stem_no_ext = stem
        .rsplit_once('.')
        .map(|(s, _)| s.to_string())
        .unwrap_or_else(|| stem.clone());
    entry == stem
        || entry == stem_no_ext
        || entry == format!("file/{stem}")
        || entry == format!("file/{stem_no_ext}")
}

#[tauri::command]
pub fn set_mod_enabled(
    path: String,
    enabled: bool,
    root: String,
) -> Result<SetEnabledResult, String> {
    let instance = {
        let trimmed = root.trim();
        if trimmed.is_empty() {
            return Err("Missing build instance root".into());
        }
        let path = PathBuf::from(trimmed);
        if !crate::instances::is_under_instances(&path) {
            // Allow freshly created folders that aren't canonicalized yet.
            let instances = crate::instances::default_instances_root();
            let norm = |p: &PathBuf| p.to_string_lossy().replace('\\', "/").to_lowercase();
            if !norm(&path).starts_with(&norm(&instances)) {
                return Err("Mod path must be under CultForge/instances".into());
            }
        }
        path
    };
    let mods_dir = instance.join("mods");
    let current = PathBuf::from(path.trim());
    if current.as_os_str().is_empty() {
        return Err("Missing mod path".into());
    }
    let current = path_under(&current, &mods_dir)?;
    if !current.is_file() {
        return Err(format!("Mod file not found: {}", current.display()));
    }

    let file_name = current
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid mod file name".to_string())?
        .to_string();

    let currently_enabled = !is_disabled_name(&file_name);
    if currently_enabled == enabled {
        return Ok(SetEnabledResult {
            path: current.to_string_lossy().to_string(),
            file_name,
            enabled,
        });
    }

    let new_name = if enabled {
        strip_disabled_suffix(&file_name)
    } else if is_disabled_name(&file_name) {
        file_name.clone()
    } else {
        format!("{file_name}.disabled")
    };

    let target = current
        .parent()
        .ok_or_else(|| "Invalid mod path".to_string())?
        .join(&new_name);

    if target != current {
        if target.exists() {
            return Err(format!(
                "Cannot rename: {} already exists",
                target.display()
            ));
        }
        fs::rename(&current, &target).map_err(|e| {
            format!("Failed to rename mod (is Minecraft running?): {e}")
        })?;
    }

    Ok(SetEnabledResult {
        path: target.to_string_lossy().to_string(),
        file_name: new_name,
        enabled,
    })
}

#[tauri::command]
pub fn read_minecraft_options(root: String) -> Result<OptionsFile, String> {
    let base = resolve_root(&root)?;
    let (path, exists, entries) = load_entries(&base)?;
    Ok(OptionsFile {
        path: path.to_string_lossy().to_string(),
        exists,
        entries,
    })
}

#[tauri::command]
pub fn write_minecraft_options(
    root: String,
    entries: Vec<OptionsEntry>,
) -> Result<OptionsFile, String> {
    let base = resolve_root(&root)?;
    let path = options_path(&base);
    // Sandbox without requiring the file to already exist.
    let expected = options_path(
        &if base.exists() {
            base.canonicalize()
                .unwrap_or_else(|_| base.clone())
        } else {
            base.clone()
        },
    );
    let path_check = if path.exists() {
        path_under(&path, &base)?
    } else {
        path.clone()
    };
    if path_check.file_name().and_then(|s| s.to_str()) != Some("options.txt") {
        return Err("Refusing to write a non-options.txt path".into());
    }
    let _ = expected;
    let text = serialize_options(&entries);
    atomic_write(&path, &text)?;
    Ok(OptionsFile {
        path: path.to_string_lossy().to_string(),
        exists: true,
        entries,
    })
}

#[tauri::command]
pub fn set_resource_pack_enabled(
    root: String,
    pack_file_name: String,
    enabled: bool,
) -> Result<OptionsFile, String> {
    let base = resolve_root(&root)?;
    let pack_file_name = pack_file_name.trim();
    if pack_file_name.is_empty() {
        return Err("Missing pack file name".into());
    }

    let (path, _exists, mut entries) = load_entries(&base)?;
    let current = get_entry_value(&entries, "resourcePacks").unwrap_or("[]");
    let mut packs = parse_resource_packs_list(current);

    let target_entry = pack_options_entry(pack_file_name);
    packs.retain(|p| !pack_entry_matches(p, pack_file_name));

    if enabled {
        packs.push(target_entry);
        if !packs.iter().any(|p| p == "vanilla") {
            packs.push("vanilla".into());
        }
    } else if packs.is_empty() {
        packs.push("vanilla".into());
    }

    set_entry_value(
        &mut entries,
        "resourcePacks",
        serialize_resource_packs_list(&packs),
    );
    atomic_write(&path, &serialize_options(&entries))?;
    Ok(OptionsFile {
        path: path.to_string_lossy().to_string(),
        exists: true,
        entries,
    })
}

#[tauri::command]
pub fn set_shader_pack(root: String, shader_name: Option<String>) -> Result<OptionsFile, String> {
    let base = resolve_root(&root)?;
    let (path, _exists, mut entries) = load_entries(&base)?;
    let value = match shader_name {
        Some(name) => {
            let trimmed = name.trim().to_string();
            if trimmed.is_empty() {
                String::new()
            } else {
                strip_disabled_suffix(&trimmed)
            }
        }
        None => String::new(),
    };
    set_entry_value(&mut entries, "shaderPack", value);
    atomic_write(&path, &serialize_options(&entries))?;
    Ok(OptionsFile {
        path: path.to_string_lossy().to_string(),
        exists: true,
        entries,
    })
}
