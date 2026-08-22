use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Drops high-frequency `downloading` events so the webview does not freeze.
pub struct ProgressThrottle {
    last: Mutex<Instant>,
    min_interval: Duration,
}

impl ProgressThrottle {
    pub fn new(min_ms: u64) -> Self {
        Self {
            last: Mutex::new(Instant::now().checked_sub(Duration::from_secs(1)).unwrap_or_else(Instant::now)),
            min_interval: Duration::from_millis(min_ms.max(1)),
        }
    }

    pub fn allow(&self, phase: &str, force: bool) -> bool {
        if force || phase != "downloading" {
            if let Ok(mut last) = self.last.lock() {
                *last = Instant::now();
            }
            return true;
        }
        let Ok(mut last) = self.last.lock() else {
            return true;
        };
        if last.elapsed() < self.min_interval {
            return false;
        }
        *last = Instant::now();
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthInstallItem {
    pub project_id: String,
    pub version_id: String,
    pub name: String,
    pub filename: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha512: String,
    pub dest_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthInstallPlan {
    pub job_id: String,
    pub build_id: String,
    pub build_location: String,
    pub cache_root: String,
    pub items: Vec<ModrinthInstallItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuildManifestSyncFile {
    pub path: String,
    pub name: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha512: String,
    pub environment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuildManifestSyncPlan {
    pub job_id: String,
    pub instance_id: String,
    pub build_location: String,
    pub cache_root: String,
    pub loader: String,
    pub release_id: String,
    pub guild_id: String,
    pub build_key: String,
    pub name: String,
    pub mc: String,
    pub version: String,
    pub java: String,
    pub image: Option<String>,
    pub manifest_generated_at: String,
    pub excludes: Vec<String>,
    pub files: Vec<GuildManifestSyncFile>,
    pub manifest_json: String,
    /// `play` = level-1 (mods + resource packs; prune extras in those dirs).
    /// `full` = full reconcile including prune (default).
    #[serde(default = "default_sync_mode")]
    pub sync_mode: String,
    /// When `Some`, skip hashing and only fetch these relative paths (from a prior check).
    /// Empty `Some` means prune-only (no downloads). `None` means scan everything.
    #[serde(default)]
    pub only_paths: Option<Vec<String>>,
}

fn default_sync_mode() -> String {
    "full".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuildSyncCheckResult {
    pub synced: bool,
    pub missing: Vec<String>,
    pub mismatched: Vec<String>,
    pub extras: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub job_id: String,
    pub item_id: String,
    pub name: String,
    pub phase: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJobSnapshot {
    pub job_id: String,
    pub phase: String,
    pub item_count: usize,
}
