//! Shared Minecraft game root layout (versions / libraries / assets).
//! Forge's legacy installer requires `launcher_profiles.json`; CultForge creates a
//! minimal stub so users never need the official Minecraft Launcher first.

use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const LAUNCHER_PROFILES_STUB: &str = r#"{
  "profiles": {
    "CultForge": {
      "name": "CultForge",
      "type": "custom",
      "lastVersionId": "latest-release"
    }
  },
  "selectedProfile": "CultForge",
  "clientToken": "00000000000000000000000000000000"
}
"#;

/// Resolve the shared Minecraft root.
///
/// Priority: `CULTFORGE_MINECRAFT_ROOT` env → `%APPDATA%/.minecraft` → `./.minecraft`.
pub fn resolve_minecraft_root() -> PathBuf {
    if let Ok(custom) = std::env::var("CULTFORGE_MINECRAFT_ROOT") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join(".minecraft");
    }
    PathBuf::from(".minecraft")
}

fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Compact ISO-ish stamp without chrono crate.
    format!("{secs}")
}

/// Create standard subdirs and a Forge-compatible `launcher_profiles.json` stub when missing.
pub fn ensure_minecraft_root(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| format!("Create Minecraft root {}: {e}", root.display()))?;
    for sub in ["versions", "libraries", "assets", "assets/indexes"] {
        let dir = root.join(sub);
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Create {}: {e}", dir.display()))?;
    }
    ensure_launcher_profiles_stub(root)?;
    upsert_cultforge_profile(root, None, None)
}

/// Write `launcher_profiles.json` if absent (required by Forge/NeoForge `--installClient`).
pub fn ensure_launcher_profiles_stub(root: &Path) -> Result<(), String> {
    let path = root.join("launcher_profiles.json");
    if path.is_file() {
        return Ok(());
    }
    fs::write(&path, LAUNCHER_PROFILES_STUB).map_err(|e| {
        format!(
            "Write launcher profile stub {}: {e}",
            path.display()
        )
    })
}

/// Upsert a standard CultForge profile into `launcher_profiles.json` for install tooling.
/// Does not remove foreign profiles.
pub fn upsert_cultforge_profile(
    root: &Path,
    last_version_id: Option<&str>,
    game_dir: Option<&str>,
) -> Result<(), String> {
    ensure_launcher_profiles_stub(root)?;
    let path = root.join("launcher_profiles.json");
    let raw = fs::read_to_string(&path).unwrap_or_else(|_| LAUNCHER_PROFILES_STUB.to_string());
    let mut root_json: Value = serde_json::from_str(&raw).unwrap_or_else(|_| {
        serde_json::from_str(LAUNCHER_PROFILES_STUB).unwrap_or(json!({}))
    });
    if !root_json.is_object() {
        root_json = json!({});
    }
    let obj = root_json.as_object_mut().unwrap();
    if !obj.contains_key("profiles") || !obj["profiles"].is_object() {
        obj.insert("profiles".into(), json!({}));
    }
    let profiles = obj.get_mut("profiles").unwrap().as_object_mut().unwrap();
    let mut profile: Map<String, Value> = profiles
        .get("CultForge")
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    profile.insert("name".into(), json!("CultForge"));
    profile.insert("type".into(), json!("custom"));
    profile.insert(
        "lastVersionId".into(),
        json!(last_version_id.unwrap_or("latest-release")),
    );
    let stamp = iso_now();
    if !profile.contains_key("created") {
        profile.insert("created".into(), json!(stamp));
    }
    profile.insert("lastUsed".into(), json!(stamp));
    if let Some(dir) = game_dir.filter(|s| !s.is_empty()) {
        profile.insert("gameDir".into(), json!(dir));
    }
    profiles.insert("CultForge".into(), Value::Object(profile));
    if !obj.contains_key("selectedProfile") {
        obj.insert("selectedProfile".into(), json!("CultForge"));
    }
    if !obj.contains_key("clientToken") {
        obj.insert(
            "clientToken".into(),
            json!("00000000000000000000000000000000"),
        );
    }
    let pretty = serde_json::to_string_pretty(&root_json)
        .map_err(|e| format!("Serialize launcher_profiles.json: {e}"))?;
    fs::write(&path, pretty).map_err(|e| {
        format!(
            "Write launcher_profiles.json {}: {e}",
            path.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn ensure_root_writes_launcher_profiles_stub() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("cultforge-bootstrap-test-{stamp}"));
        ensure_minecraft_root(&root).expect("bootstrap");
        assert!(root.join("versions").is_dir());
        assert!(root.join("libraries").is_dir());
        assert!(root.join("assets").is_dir());
        let profiles = root.join("launcher_profiles.json");
        assert!(profiles.is_file());
        let raw = fs::read_to_string(&profiles).unwrap();
        assert!(raw.contains("\"profiles\""));
        assert!(raw.contains("CultForge"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn ensure_profiles_stub_is_idempotent() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("cultforge-bootstrap-idem-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("launcher_profiles.json");
        fs::write(&path, r#"{"profiles":{"keep":true}}"#).unwrap();
        ensure_launcher_profiles_stub(&root).expect("stub");
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"profiles":{"keep":true}}"#);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn upsert_merges_without_clobbering_foreign() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("cultforge-bootstrap-upsert-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("launcher_profiles.json");
        fs::write(
            &path,
            r#"{"profiles":{"Other":{"name":"Other","type":"custom"}},"selectedProfile":"Other"}"#,
        )
        .unwrap();
        upsert_cultforge_profile(&root, Some("1.21.1"), Some(r"C:\Games\cf")).expect("upsert");
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"Other\""));
        assert!(raw.contains("CultForge"));
        assert!(raw.contains("1.21.1"));
        let _ = fs::remove_dir_all(&root);
    }
}
