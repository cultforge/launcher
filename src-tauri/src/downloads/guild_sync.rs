//! Guild manifest reconcile: verify hashes, download missing, prune extras.

use super::fetch;
use super::install::{self, resolve_manifest_path, MANAGED_TOP_DIRS};
use super::plan::{
    DownloadProgressEvent, GuildManifestSyncFile, GuildManifestSyncPlan, GuildSyncCheckResult,
    ProgressThrottle,
};
use super::verify;
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

const SCAN_CONCURRENCY: usize = 8;
const DOWNLOAD_CONCURRENCY: usize = 6;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedInstanceMeta {
    pub instance_id: String,
    pub path: String,
    pub guild_id: String,
    pub release_id: String,
    pub build_key: String,
    pub name: String,
    pub mc: String,
    pub loader: String,
    pub java: String,
    pub version: String,
    pub image: Option<String>,
    pub created: String,
    pub manifest_generated_at: Option<String>,
    pub sync_status: String,
}

fn cultforge_dir(root: &Path) -> PathBuf {
    root.join(".cultforge")
}

fn managed_meta_path(root: &Path) -> PathBuf {
    cultforge_dir(root).join("managed.json")
}

fn cached_manifest_path(root: &Path) -> PathBuf {
    cultforge_dir(root).join("manifest.json")
}

fn normalize_rel(path: &str) -> String {
    path.trim().replace('\\', "/").trim_start_matches('/').to_string()
}

fn is_client_file(env: &str) -> bool {
    let lower = env.trim().to_ascii_lowercase();
    lower.is_empty() || lower == "client" || lower == "both"
}

/// Level-1 play sync: mods + resource packs are required. Shaders/configs are not.
fn is_level1_path(rel: &str) -> bool {
    let norm = normalize_rel(rel).to_ascii_lowercase();
    norm.starts_with("mods/") || norm.starts_with("resourcepacks/")
}

fn is_play_mode(mode: &str) -> bool {
    mode.trim().eq_ignore_ascii_case("play")
}

fn path_excluded(rel: &str, excludes: &[String]) -> bool {
    let norm = normalize_rel(rel).to_ascii_lowercase();
    if norm.starts_with("saves/") || norm == "saves" {
        return true;
    }
    if norm.starts_with(".cultforge/") || norm == ".cultforge" {
        return true;
    }
    for pattern in excludes {
        let pat = normalize_rel(pattern).to_ascii_lowercase();
        if pat.is_empty() {
            continue;
        }
        if pat.ends_with("/**") {
            let prefix = pat.trim_end_matches("/**");
            if norm == prefix || norm.starts_with(&format!("{prefix}/")) {
                return true;
            }
        } else if pat.ends_with("/*") {
            let prefix = pat.trim_end_matches("/*");
            if norm.starts_with(&format!("{prefix}/")) {
                let rest = &norm[prefix.len() + 1..];
                if !rest.contains('/') {
                    return true;
                }
            }
        } else if norm == pat || norm.starts_with(&format!("{pat}/")) {
            return true;
        }
    }
    false
}

fn client_files(files: &[GuildManifestSyncFile]) -> Vec<&GuildManifestSyncFile> {
    files
        .iter()
        .filter(|f| is_client_file(&f.environment))
        .filter(|f| !path_excluded(&f.path, &[]))
        .collect()
}

async fn file_matches(
    path: &Path,
    expected_sha512: &str,
    expected_size: u64,
) -> Result<bool, String> {
    if !path.is_file() {
        return Ok(false);
    }
    if expected_sha512.trim().is_empty() {
        return Ok(false);
    }
    if expected_size > 0 {
        let meta = tokio::fs::metadata(path)
            .await
            .map_err(|e| format!("stat {}: {e}", path.display()))?;
        if meta.len() != expected_size {
            return Ok(false);
        }
    }
    let actual = verify::sha512_file(path).await?;
    Ok(verify::sha512_equal(&actual, expected_sha512))
}

fn list_level1_files(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    for top in ["mods", "resourcepacks"] {
        let dir = root.join(top);
        if dir.is_dir() {
            walk_files(&dir, root, &mut out);
        }
    }
    out
}

async fn prune_level1_extras(
    build_location: &str,
    expected: &HashSet<String>,
    excludes: &[String],
) -> Result<usize, String> {
    let root = PathBuf::from(build_location);
    let mut removed = 0usize;
    for rel in list_level1_files(&root) {
        if path_excluded(&rel, excludes) {
            continue;
        }
        if expected.contains(&rel) {
            continue;
        }
        let mut path = root.clone();
        for part in rel.split('/') {
            if !part.is_empty() {
                path = path.join(part);
            }
        }
        if path.is_file() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| format!("Failed to remove extra {}: {e}", path.display()))?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn walk_files(dir: &Path, root: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_files(&path, root, out);
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(normalize_rel(&rel.to_string_lossy()));
            }
        }
    }
}

fn list_managed_files(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    for top in MANAGED_TOP_DIRS {
        let dir = root.join(top);
        if dir.is_dir() {
            walk_files(&dir, root, &mut out);
        }
    }
    out
}

pub async fn check_sync(
    build_location: &str,
    files: &[GuildManifestSyncFile],
    excludes: &[String],
    sync_mode: &str,
) -> Result<GuildSyncCheckResult, String> {
    let root = PathBuf::from(build_location.trim());
    if root.as_os_str().is_empty() {
        return Err("Build location is empty".into());
    }

    let play = is_play_mode(sync_mode);
    let mut missing = Vec::new();
    let mut mismatched = Vec::new();
    let mut expected = HashSet::new();

    for file in client_files(files) {
        let rel = normalize_rel(&file.path);
        if path_excluded(&rel, excludes) {
            continue;
        }
        if play && !is_level1_path(&rel) {
            continue;
        }
        expected.insert(rel.clone());
        let dest = match resolve_manifest_path(build_location, &rel) {
            Ok(p) => p,
            Err(_) => {
                missing.push(rel);
                continue;
            }
        };
        if !dest.is_file() {
            missing.push(rel);
            continue;
        }
        match file_matches(&dest, &file.sha512, file.size_bytes).await {
            Ok(true) => {}
            Ok(false) => mismatched.push(rel),
            Err(_) => mismatched.push(rel),
        }
    }

    let mut extras = Vec::new();
    if play {
        // Level-1: extras under mods/resourcepacks must be pruned for managed purity.
        for rel in list_level1_files(&root) {
            if path_excluded(&rel, excludes) {
                continue;
            }
            if !expected.contains(&rel) {
                extras.push(rel);
            }
        }
    } else {
        for rel in list_managed_files(&root) {
            if path_excluded(&rel, excludes) {
                continue;
            }
            if !expected.contains(&rel) {
                extras.push(rel);
            }
        }
    }

    Ok(GuildSyncCheckResult {
        synced: missing.is_empty() && mismatched.is_empty() && extras.is_empty(),
        missing,
        mismatched,
        extras,
    })
}

async fn prune_extras(
    build_location: &str,
    expected: &HashSet<String>,
    excludes: &[String],
) -> Result<usize, String> {
    let root = PathBuf::from(build_location);
    let mut removed = 0usize;
    for rel in list_managed_files(&root) {
        if path_excluded(&rel, excludes) {
            continue;
        }
        if expected.contains(&rel) {
            continue;
        }
        let mut path = root.clone();
        for part in rel.split('/') {
            if !part.is_empty() {
                path = path.join(part);
            }
        }
        if path.is_file() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| format!("Failed to remove extra {}: {e}", path.display()))?;
            removed += 1;
        }
    }
    Ok(removed)
}

pub async fn persist_managed_meta(
    plan: &GuildManifestSyncPlan,
    sync_status: &str,
) -> Result<(), String> {
    write_managed_meta(plan, sync_status).await
}

async fn write_managed_meta(plan: &GuildManifestSyncPlan, sync_status: &str) -> Result<(), String> {
    let root = PathBuf::from(&plan.build_location);
    let dir = cultforge_dir(&root);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create .cultforge: {e}"))?;

    let meta = ManagedInstanceMeta {
        instance_id: plan.instance_id.clone(),
        path: plan.build_location.clone(),
        guild_id: plan.guild_id.clone(),
        release_id: plan.release_id.clone(),
        build_key: plan.build_key.clone(),
        name: plan.name.clone(),
        mc: plan.mc.clone(),
        loader: plan.loader.clone(),
        java: plan.java.clone(),
        version: plan.version.clone(),
        image: plan.image.clone(),
        created: chrono_like_now(),
        manifest_generated_at: Some(plan.manifest_generated_at.clone()),
        sync_status: sync_status.to_string(),
    };
    let text = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize managed meta: {e}"))?;
    tokio::fs::write(managed_meta_path(&root), text)
        .await
        .map_err(|e| format!("Failed to write managed.json: {e}"))?;

    tokio::fs::write(cached_manifest_path(&root), plan.manifest_json.as_bytes())
        .await
        .map_err(|e| format!("Failed to write manifest.json: {e}"))?;
    Ok(())
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

pub fn list_managed_instances() -> Result<Vec<ManagedInstanceMeta>, String> {
    let root = crate::instances::default_instances_root();
    if !root.is_dir() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&root).map_err(|e| format!("Failed to read instances: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let meta_path = managed_meta_path(&path);
        if !meta_path.is_file() {
            continue;
        }
        let text = std::fs::read_to_string(&meta_path)
            .map_err(|e| format!("Failed to read {}: {e}", meta_path.display()))?;
        let mut meta: ManagedInstanceMeta = serde_json::from_str(&text)
            .map_err(|e| format!("Invalid managed.json in {}: {e}", path.display()))?;
        meta.path = path.to_string_lossy().to_string();
        if meta.instance_id.trim().is_empty() {
            meta.instance_id = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
        }
        out.push(meta);
    }
    Ok(out)
}

fn emit(app: &AppHandle, event: DownloadProgressEvent) {
    let _ = app.emit("download-progress", event);
}

async fn sync_one_file(
    app: AppHandle,
    client: reqwest::Client,
    file: GuildManifestSyncFile,
    job_id: String,
    build_location: String,
    cache_root: String,
    cancel_rx: watch::Receiver<bool>,
    abort: Arc<AtomicBool>,
) -> Result<(), String> {
    if *cancel_rx.borrow() || abort.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }

    let rel = normalize_rel(&file.path);
    if file.url.trim().is_empty() {
        emit(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: rel.clone(),
                name: file.name.clone(),
                phase: "error".into(),
                downloaded_bytes: 0,
                total_bytes: file.size_bytes,
                error: Some("Manifest file has no download URL".into()),
            },
        );
        return Err("Manifest file has no download URL".into());
    }

    let filename = Path::new(&rel)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file.name.clone());

    emit(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: rel.clone(),
            name: file.name.clone(),
            phase: "downloading".into(),
            downloaded_bytes: 0,
            total_bytes: file.size_bytes.max(1),
            error: None,
        },
    );

    let gate = ProgressThrottle::new(120);
    let app_progress = app.clone();
    let job_progress = job_id.clone();
    let item_id = rel.clone();
    let item_name = file.name.clone();
    let download_result = fetch::download_to_cache(
        &client,
        &file.url,
        &cache_root,
        &file.sha512,
        &filename,
        file.size_bytes,
        |downloaded, total| {
            if gate.allow("downloading", downloaded >= total) {
                emit(
                    &app_progress,
                    DownloadProgressEvent {
                        job_id: job_progress.clone(),
                        item_id: item_id.clone(),
                        name: item_name.clone(),
                        phase: "downloading".into(),
                        downloaded_bytes: downloaded,
                        total_bytes: total,
                        error: None,
                    },
                );
            }
        },
        &cancel_rx,
        Some(&abort),
    )
    .await;

    let cached = match download_result {
        Ok(path) => path,
        Err(err) if err == "cancelled" => return Err("cancelled".into()),
        Err(err) => {
            emit(
                &app,
                DownloadProgressEvent {
                    job_id: job_id.clone(),
                    item_id: rel.clone(),
                    name: file.name.clone(),
                    phase: "error".into(),
                    downloaded_bytes: 0,
                    total_bytes: file.size_bytes,
                    error: Some(err.clone()),
                },
            );
            return Err(err);
        }
    };

    emit(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: rel.clone(),
            name: file.name.clone(),
            phase: "verifying".into(),
            downloaded_bytes: file.size_bytes,
            total_bytes: file.size_bytes.max(1),
            error: None,
        },
    );

    match verify::sha512_file(&cached).await {
        Ok(actual) => {
            if let Err(err) = verify::assert_sha512(&actual, &file.sha512) {
                let _ = tokio::fs::remove_file(&cached).await;
                emit(
                    &app,
                    DownloadProgressEvent {
                        job_id: job_id.clone(),
                        item_id: rel.clone(),
                        name: file.name.clone(),
                        phase: "error".into(),
                        downloaded_bytes: 0,
                        total_bytes: file.size_bytes,
                        error: Some(err.clone()),
                    },
                );
                return Err(err);
            }
        }
        Err(err) => {
            emit(
                &app,
                DownloadProgressEvent {
                    job_id: job_id.clone(),
                    item_id: rel.clone(),
                    name: file.name.clone(),
                    phase: "error".into(),
                    downloaded_bytes: 0,
                    total_bytes: file.size_bytes,
                    error: Some(err.clone()),
                },
            );
            return Err(err);
        }
    }

    emit(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: rel.clone(),
            name: file.name.clone(),
            phase: "installing".into(),
            downloaded_bytes: file.size_bytes,
            total_bytes: file.size_bytes.max(1),
            error: None,
        },
    );

    if let Err(err) = install::install_cached_at_relative(&cached, &build_location, &rel).await {
        emit(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: rel.clone(),
                name: file.name.clone(),
                phase: "error".into(),
                downloaded_bytes: file.size_bytes,
                total_bytes: file.size_bytes.max(1),
                error: Some(err.clone()),
            },
        );
        return Err(err);
    }

    emit(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: rel,
            name: file.name.clone(),
            phase: "done".into(),
            downloaded_bytes: file.size_bytes,
            total_bytes: file.size_bytes.max(1),
            error: None,
        },
    );
    Ok(())
}

pub async fn run_guild_sync_job(
    app: AppHandle,
    plan: GuildManifestSyncPlan,
    cancel_rx: watch::Receiver<bool>,
    set_phase: impl Fn(&str),
) {
    let job_id = plan.job_id.clone();
    let client = match reqwest::Client::builder()
        .user_agent("CultForge/2.4.0 (launcher)")
        .pool_max_idle_per_host(DOWNLOAD_CONCURRENCY)
        .build()
    {
        Ok(c) => c,
        Err(err) => {
            emit(
                &app,
                DownloadProgressEvent {
                    job_id: job_id.clone(),
                    item_id: "job".into(),
                    name: "Guild sync".into(),
                    phase: "error".into(),
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    error: Some(format!("Failed to create HTTP client: {err}")),
                },
            );
            set_phase("error");
            return;
        }
    };

    let play = is_play_mode(&plan.sync_mode);
    let skip_scan = plan.only_paths.is_some();
    let only_set: HashSet<String> = plan
        .only_paths
        .as_ref()
        .map(|paths| {
            paths
                .iter()
                .map(|p| normalize_rel(p))
                .filter(|p| !p.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let files: Vec<GuildManifestSyncFile> = client_files(&plan.files)
        .into_iter()
        .filter(|file| {
            let rel = normalize_rel(&file.path);
            if path_excluded(&rel, &plan.excludes) {
                return false;
            }
            if play && !is_level1_path(&rel) {
                return false;
            }
            if skip_scan && !only_set.contains(&rel) {
                return false;
            }
            true
        })
        .cloned()
        .collect();

    // Expected set always includes the full in-scope manifest (for prune), not just only_paths.
    let mut expected = HashSet::new();
    for file in client_files(&plan.files) {
        let rel = normalize_rel(&file.path);
        if path_excluded(&rel, &plan.excludes) {
            continue;
        }
        if play && !is_level1_path(&rel) {
            continue;
        }
        expected.insert(rel);
    }

    let mut to_fetch: Vec<GuildManifestSyncFile> = Vec::new();

    if skip_scan {
        to_fetch = files;
        let fetch_total: u64 = to_fetch.iter().map(|f| f.size_bytes).sum::<u64>().max(1);
        emit(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: "job".into(),
                name: plan.name.clone(),
                phase: if to_fetch.is_empty() {
                    "installing".into()
                } else {
                    "downloading".into()
                },
                downloaded_bytes: 0,
                total_bytes: fetch_total,
                error: None,
            },
        );
    } else {
        let scan_total: u64 = files.iter().map(|f| f.size_bytes).sum::<u64>().max(1);
        emit(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: "job".into(),
                name: plan.name.clone(),
                phase: "verifying".into(),
                downloaded_bytes: 0,
                total_bytes: scan_total,
                error: None,
            },
        );
        set_phase("verifying");

        let build_location = plan.build_location.clone();
        let scan_gate = Arc::new(ProgressThrottle::new(100));
        let mut scanned_bytes: u64 = 0;

        {
            let mut scan = stream::iter(files.into_iter().map(|file| {
                let build_location = build_location.clone();
                async move {
                    let rel = normalize_rel(&file.path);
                    let dest = resolve_manifest_path(&build_location, &rel)?;
                    let ok = file_matches(&dest, &file.sha512, file.size_bytes)
                        .await
                        .unwrap_or(false);
                    Ok::<_, String>((file, rel, ok))
                }
            }))
            .buffer_unordered(SCAN_CONCURRENCY);

            while let Some(result) = scan.next().await {
                if *cancel_rx.borrow() {
                    emit(
                        &app,
                        DownloadProgressEvent {
                            job_id: job_id.clone(),
                            item_id: "job".into(),
                            name: plan.name.clone(),
                            phase: "cancelled".into(),
                            downloaded_bytes: scanned_bytes,
                            total_bytes: scan_total,
                            error: None,
                        },
                    );
                    set_phase("cancelled");
                    return;
                }

                match result {
                    Ok((file, _rel, true)) => {
                        scanned_bytes = scanned_bytes.saturating_add(file.size_bytes);
                    }
                    Ok((file, _rel, false)) => {
                        to_fetch.push(file);
                    }
                    Err(err) => {
                        emit(
                            &app,
                            DownloadProgressEvent {
                                job_id: job_id.clone(),
                                item_id: "job".into(),
                                name: plan.name.clone(),
                                phase: "error".into(),
                                downloaded_bytes: scanned_bytes,
                                total_bytes: scan_total,
                                error: Some(err),
                            },
                        );
                        set_phase("error");
                        return;
                    }
                }

                if scan_gate.allow("downloading", false) {
                    emit(
                        &app,
                        DownloadProgressEvent {
                            job_id: job_id.clone(),
                            item_id: "job".into(),
                            name: plan.name.clone(),
                            phase: "verifying".into(),
                            downloaded_bytes: scanned_bytes.min(scan_total),
                            total_bytes: scan_total,
                            error: None,
                        },
                    );
                }
            }
        }
    }

    let total_bytes: u64 = to_fetch.iter().map(|f| f.size_bytes).sum::<u64>().max(1);

    emit(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: "job".into(),
            name: plan.name.clone(),
            phase: if to_fetch.is_empty() {
                "installing".into()
            } else {
                "downloading".into()
            },
            downloaded_bytes: 0,
            total_bytes,
            error: None,
        },
    );

    if !to_fetch.is_empty() {
        set_phase("downloading");
        let abort = Arc::new(AtomicBool::new(false));
        let mut downloads = stream::iter(to_fetch.into_iter().map(|file| {
            let app = app.clone();
            let client = client.clone();
            let job_id = job_id.clone();
            let build_location = plan.build_location.clone();
            let cache_root = plan.cache_root.clone();
            let cancel_rx = cancel_rx.clone();
            let abort = abort.clone();
            async move {
                sync_one_file(
                    app,
                    client,
                    file,
                    job_id,
                    build_location,
                    cache_root,
                    cancel_rx,
                    abort,
                )
                .await
            }
        }))
        .buffer_unordered(DOWNLOAD_CONCURRENCY);

        while let Some(result) = downloads.next().await {
            match result {
                Ok(()) => {}
                Err(err) if err == "cancelled" => {
                    abort.store(true, Ordering::Relaxed);
                    emit(
                        &app,
                        DownloadProgressEvent {
                            job_id: job_id.clone(),
                            item_id: "job".into(),
                            name: plan.name.clone(),
                            phase: "cancelled".into(),
                            downloaded_bytes: 0,
                            total_bytes,
                            error: None,
                        },
                    );
                    set_phase("cancelled");
                    return;
                }
                Err(err) => {
                    abort.store(true, Ordering::Relaxed);
                    emit(
                        &app,
                        DownloadProgressEvent {
                            job_id: job_id.clone(),
                            item_id: "job".into(),
                            name: plan.name.clone(),
                            phase: "error".into(),
                            downloaded_bytes: 0,
                            total_bytes,
                            error: Some(err),
                        },
                    );
                    set_phase("error");
                    return;
                }
            }
        }
    }

    set_phase("installing");
    let prune_result = if play {
        prune_level1_extras(&plan.build_location, &expected, &plan.excludes).await
    } else {
        prune_extras(&plan.build_location, &expected, &plan.excludes).await
    };
    if let Err(err) = prune_result {
        emit(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: "job".into(),
                name: "Guild sync".into(),
                phase: "error".into(),
                downloaded_bytes: 0,
                total_bytes: 0,
                error: Some(err),
            },
        );
        set_phase("error");
        return;
    }

    if let Err(err) = write_managed_meta(&plan, "synced").await {
        emit(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: "job".into(),
                name: "Guild sync".into(),
                phase: "error".into(),
                downloaded_bytes: 0,
                total_bytes: 0,
                error: Some(err),
            },
        );
        set_phase("error");
        return;
    }

    emit(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: "job".into(),
            name: plan.name.clone(),
            phase: "done".into(),
            downloaded_bytes: total_bytes,
            total_bytes,
            error: None,
        },
    );
    set_phase("done");
}