//! Shared Minecraft game root layout (versions / libraries / assets).
//! Forge's legacy installer requires `launcher_profiles.json`; CultForge creates a
//! minimal stub so users never need the official Minecraft Launcher first.

use std::fs;
use std::path::{Path, PathBuf};

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

/// Create standard subdirs and a Forge-compatible `launcher_profiles.json` stub when missing.
pub fn ensure_minecraft_root(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| format!("Create Minecraft root {}: {e}", root.display()))?;
    for sub in ["versions", "libraries", "assets", "assets/indexes"] {
        let dir = root.join(sub);
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Create {}: {e}", dir.display()))?;
    }
    ensure_launcher_profiles_stub(root)
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
}
