//! Write / merge Minecraft `servers.dat` (uncompressed NBT) into an instance gameDir.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerListEntry {
    pub name: String,
    pub ip: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ServersFile {
    #[serde(default)]
    servers: Vec<ServerEntryNbt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerEntryNbt {
    name: String,
    ip: String,
    #[serde(
        rename = "acceptTextures",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    accept_textures: Option<i8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    hidden: Option<i8>,
}

fn normalize_ip(ip: &str) -> String {
    let t = ip.trim();
    if t.is_empty() {
        return String::new();
    }
    // Minecraft accepts host without :25565
    if let Some((host, port)) = t.rsplit_once(':') {
        if port == "25565" {
            return host.to_string();
        }
    }
    t.to_string()
}

fn ips_equal(a: &str, b: &str) -> bool {
    normalize_ip(a).eq_ignore_ascii_case(&normalize_ip(b))
}

/// Upsert CultForge-managed servers into `{game_dir}/servers.dat`.
/// Preserves other player-added entries; updates name when IP already exists.
pub fn upsert_servers_dat(game_dir: &Path, entries: &[ServerListEntry]) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }
    fs::create_dir_all(game_dir)
        .map_err(|e| format!("create game dir for servers.dat: {e}"))?;

    let path = game_dir.join("servers.dat");
    let mut file = if path.is_file() {
        match fs::read(&path) {
            Ok(bytes) => fastnbt::from_bytes::<ServersFile>(&bytes).unwrap_or_default(),
            Err(_) => ServersFile::default(),
        }
    } else {
        ServersFile::default()
    };

    for entry in entries {
        let name = entry.name.trim();
        let ip = normalize_ip(&entry.ip);
        if name.is_empty() || ip.is_empty() {
            continue;
        }
        if let Some(existing) = file.servers.iter_mut().find(|s| ips_equal(&s.ip, &ip)) {
            existing.name = name.to_string();
            existing.ip = ip;
            if existing.accept_textures.is_none() {
                existing.accept_textures = Some(1);
            }
        } else {
            file.servers.push(ServerEntryNbt {
                name: name.to_string(),
                ip,
                accept_textures: Some(1),
                icon: None,
                hidden: None,
            });
        }
    }

    // Uncompressed NBT (servers.dat must NOT be gzip).
    let bytes =
        fastnbt::to_bytes(&file).map_err(|e| format!("encode servers.dat: {e}"))?;
    fs::write(&path, bytes).map_err(|e| format!("write servers.dat: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn writes_and_merges_by_ip() {
        let dir = env::temp_dir().join(format!("cf-servers-dat-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        upsert_servers_dat(
            &dir,
            &[ServerListEntry {
                name: "Test".into(),
                ip: "play.example.com:25565".into(),
            }],
        )
        .unwrap();

        upsert_servers_dat(
            &dir,
            &[
                ServerListEntry {
                    name: "Test World".into(),
                    ip: "play.example.com".into(),
                },
                ServerListEntry {
                    name: "Other".into(),
                    ip: "other.example.com:25566".into(),
                },
            ],
        )
        .unwrap();

        let bytes = fs::read(dir.join("servers.dat")).unwrap();
        let parsed: ServersFile = fastnbt::from_bytes(&bytes).unwrap();
        assert_eq!(parsed.servers.len(), 2);
        assert_eq!(parsed.servers[0].name, "Test World");
        assert_eq!(parsed.servers[0].ip, "play.example.com");
        assert_eq!(parsed.servers[1].ip, "other.example.com:25566");
        let _ = fs::remove_dir_all(&dir);
    }
}
