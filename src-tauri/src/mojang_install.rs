//! Pull a vanilla Minecraft version from Mojang and create a CultForge instance.
//! Shared files go under `.minecraft` (versions / libraries / assets).
//! The playable instance lives in `%APPDATA%/CultForge/instances/{versionId}/`.

use crate::downloads::plan::{DownloadProgressEvent, ProgressThrottle};
use crate::launch::{current_arch, current_os, rules_allow};
use crate::minecraft_bootstrap::ensure_minecraft_root;
use crate::scanner::default_minecraft_root;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use url::Url;

const USER_AGENT: &str = "CultForge/2.4.0 (launcher; mojang-install)";
const MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const ASSET_BASE: &str = "https://resources.download.minecraft.net";
const LIB_BASE: &str = "https://libraries.minecraft.net";
const ASSET_CONCURRENCY: usize = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MojangVersionInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub release_time: String,
    pub url: String,
    pub sha1: Option<String>,
    pub latest_release: bool,
    pub latest_snapshot: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MojangInstallResult {
    pub version_id: String,
    pub instance_path: String,
    pub version_path: String,
    pub java_major: Option<u32>,
    pub downloaded_files: u32,
    pub skipped_files: u32,
}

fn assert_mojang_host(url: &Url) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("Only https Mojang download URLs are allowed".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Mojang URL missing host".to_string())?
        .to_ascii_lowercase();
    const ALLOWED: &[&str] = &[
        "piston-meta.mojang.com",
        "launchermeta.mojang.com",
        "piston-data.mojang.com",
        "launcher.mojang.com",
        "libraries.minecraft.net",
        "resources.download.minecraft.net",
    ];
    if ALLOWED.iter().any(|h| host == *h) {
        return Ok(());
    }
    Err(format!("Download host not allowlisted: {host}"))
}

fn emit_progress(
    app: &AppHandle,
    job_id: &str,
    item_id: &str,
    name: &str,
    phase: &str,
    downloaded: u64,
    total: u64,
    error: Option<String>,
) {
    let _ = app.emit(
        "download-progress",
        DownloadProgressEvent {
            job_id: job_id.to_string(),
            item_id: item_id.to_string(),
            name: name.to_string(),
            phase: phase.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: total,
            error,
        },
    );
}

fn emit_job_progress(
    gate: &ProgressThrottle,
    app: &AppHandle,
    job_id: &str,
    item_id: &str,
    name: &str,
    phase: &str,
    downloaded: u64,
    total: u64,
    error: Option<String>,
) {
    if !gate.allow(phase, error.is_some()) {
        return;
    }
    emit_progress(app, job_id, item_id, name, phase, downloaded, total, error);
}

fn sha1_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Open {}: {e}", path.display()))?;
    let mut hasher = Sha1::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Hash {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn file_is_valid(path: &Path, sha1: Option<&str>, size: u64) -> bool {
    if !path.is_file() {
        return false;
    }
    let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size > 0 {
        return len == size;
    }
    // Unknown size (version JSON): verify hash when we have one.
    if let Some(expected) = sha1.filter(|s| !s.is_empty()) {
        return sha1_file(path)
            .map(|actual| actual.eq_ignore_ascii_case(expected))
            .unwrap_or(false);
    }
    true
}

async fn http_get_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    let parsed = Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    assert_mojang_host(&parsed)?;
    let res = client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed ({url}): {e}"))?
        .error_for_status()
        .map_err(|e| format!("HTTP error ({url}): {e}"))?;
    res.json()
        .await
        .map_err(|e| format!("Invalid JSON ({url}): {e}"))
}

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
    expected_size: u64,
    mut on_progress: impl FnMut(u64, u64),
) -> Result<bool, String> {
    if file_is_valid(dest, expected_sha1, expected_size) {
        let size = fs::metadata(dest).map(|m| m.len()).unwrap_or(expected_size);
        on_progress(size.max(1), size.max(1));
        return Ok(false);
    }
    let parsed = Url::parse(url).map_err(|e| format!("Invalid download URL: {e}"))?;
    assert_mojang_host(&parsed)?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Create {}: {e}", parent.display()))?;
    }
    let part = dest.with_extension("part");
    if part.exists() {
        let _ = tokio::fs::remove_file(&part).await;
    }
    let response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Download failed ({url}): {e}"))?
        .error_for_status()
        .map_err(|e| format!("Download HTTP error ({url}): {e}"))?;
    let total = response
        .content_length()
        .unwrap_or(expected_size)
        .max(expected_size)
        .max(1);
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| format!("Create {}: {e}", part.display()))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Stream error ({url}): {e}"))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("Write {}: {e}", part.display()))?;
        downloaded = downloaded.saturating_add(bytes.len() as u64);
        on_progress(downloaded, total);
    }
    file.flush()
        .await
        .map_err(|e| format!("Flush {}: {e}", part.display()))?;
    drop(file);
    tokio::fs::rename(&part, dest)
        .await
        .map_err(|e| format!("Finalize {}: {e}", dest.display()))?;
    if let Some(expected) = expected_sha1.filter(|s| !s.is_empty()) {
        let actual = sha1_file(dest)?;
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = fs::remove_file(dest);
            return Err(format!(
                "SHA-1 mismatch for {} (expected {expected}, got {actual})",
                dest.display()
            ));
        }
    }
    Ok(true)
}

fn library_maven_url(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).copied();
    let file = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.jar"),
        None => format!("{artifact}-{version}.jar"),
    };
    Some(format!("{LIB_BASE}/{group}/{artifact}/{version}/{file}"))
}

fn library_maven_path(minecraft_root: &Path, name: &str) -> Option<PathBuf> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).copied();
    let file = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.jar"),
        None => format!("{artifact}-{version}.jar"),
    };
    Some(
        minecraft_root
            .join("libraries")
            .join(group)
            .join(artifact)
            .join(version)
            .join(file),
    )
}

struct FetchItem {
    url: String,
    dest: PathBuf,
    sha1: Option<String>,
    size: u64,
    #[allow(dead_code)]
    label: String,
}

fn native_classifier(lib: &Value) -> Option<String> {
    let natives = lib.get("natives")?.as_object()?;
    let key = match current_os() {
        "windows" => "windows",
        "osx" => "osx",
        _ => "linux",
    };
    let raw = natives.get(key)?.as_str()?;
    Some(raw.replace(
        "${arch}",
        if current_arch() == "x86" { "32" } else { "64" },
    ))
}

fn collect_library_items(minecraft_root: &Path, doc: &Value) -> Vec<FetchItem> {
    let mut out = Vec::new();
    let Some(libs) = doc.get("libraries").and_then(|v| v.as_array()) else {
        return out;
    };
    for lib in libs {
        if let Some(rules) = lib.get("rules") {
            if !rules_allow(rules) {
                continue;
            }
        }
        if let Some(artifact) = lib.pointer("/downloads/artifact") {
            let url = artifact.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let sha1 = artifact
                .get("sha1")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let size = artifact.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            let dest = if let Some(path) = artifact.get("path").and_then(|v| v.as_str()) {
                minecraft_root.join("libraries").join(path)
            } else if let Some(name) = lib.get("name").and_then(|v| v.as_str()) {
                match library_maven_path(minecraft_root, name) {
                    Some(p) => p,
                    None => continue,
                }
            } else {
                continue;
            };
            let url = if url.is_empty() {
                lib.get("name")
                    .and_then(|v| v.as_str())
                    .and_then(library_maven_url)
                    .unwrap_or_default()
            } else {
                url.to_string()
            };
            if !url.is_empty() {
                let label = dest
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("library")
                    .to_string();
                out.push(FetchItem {
                    url,
                    dest,
                    sha1,
                    size,
                    label,
                });
            }
        } else if let Some(name) = lib.get("name").and_then(|v| v.as_str()) {
            if let (Some(url), Some(dest)) = (
                library_maven_url(name),
                library_maven_path(minecraft_root, name),
            ) {
                out.push(FetchItem {
                    url,
                    dest,
                    sha1: None,
                    size: 0,
                    label: name.to_string(),
                });
            }
        }
        if let Some(classifier) = native_classifier(lib) {
            if let Some(native) = lib.pointer(&format!("/downloads/classifiers/{classifier}")) {
                let url = native.get("url").and_then(|v| v.as_str()).unwrap_or("");
                let sha1 = native
                    .get("sha1")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let size = native.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                let dest = if let Some(path) = native.get("path").and_then(|v| v.as_str()) {
                    minecraft_root.join("libraries").join(path)
                } else if let Some(name) = lib.get("name").and_then(|v| v.as_str()) {
                    match library_maven_path(minecraft_root, &format!("{name}:{classifier}")) {
                        Some(p) => p,
                        None => continue,
                    }
                } else {
                    continue;
                };
                if !url.is_empty() {
                    let label = dest
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("natives")
                        .to_string();
                    out.push(FetchItem {
                        url: url.to_string(),
                        dest,
                        sha1,
                        size,
                        label,
                    });
                }
            }
        }
    }
    out
}

fn collect_client_items(minecraft_root: &Path, doc: &Value) -> Vec<FetchItem> {
    let mut out = Vec::new();
    let id = doc.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return out;
    }
    if let Some(client) = doc.pointer("/downloads/client") {
        let url = client.get("url").and_then(|v| v.as_str()).unwrap_or("");
        if !url.is_empty() {
            out.push(FetchItem {
                url: url.to_string(),
                dest: minecraft_root
                    .join("versions")
                    .join(id)
                    .join(format!("{id}.jar")),
                sha1: client
                    .get("sha1")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                size: client.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
                label: format!("{id}.jar"),
            });
        }
    }
    if let Some(log) = doc.pointer("/logging/client/file") {
        let url = log.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let file_id = log.get("id").and_then(|v| v.as_str()).unwrap_or("client.xml");
        if !url.is_empty() {
            out.push(FetchItem {
                url: url.to_string(),
                dest: minecraft_root.join("assets").join("log_configs").join(file_id),
                sha1: log
                    .get("sha1")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                size: log.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
                label: file_id.to_string(),
            });
        }
    }
    out
}

fn collect_asset_items(minecraft_root: &Path, index: &Value) -> Vec<FetchItem> {
    let mut out = Vec::new();
    let Some(objects) = index.get("objects").and_then(|v| v.as_object()) else {
        return out;
    };
    for (name, obj) in objects {
        let hash = obj.get("hash").and_then(|v| v.as_str()).unwrap_or("");
        if hash.len() < 2 {
            continue;
        }
        let size = obj.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
        let prefix = &hash[..2];
        out.push(FetchItem {
            url: format!("{ASSET_BASE}/{prefix}/{hash}"),
            dest: minecraft_root
                .join("assets")
                .join("objects")
                .join(prefix)
                .join(hash),
            sha1: Some(hash.to_string()),
            size,
            label: name.clone(),
        });
    }
    out
}

async fn fetch_version_docs(
    client: &reqwest::Client,
    manifest: &Value,
    version_id: &str,
    minecraft_root: &Path,
) -> Result<Vec<Value>, String> {
    let mut chain = Vec::new();
    let mut current = version_id.to_string();
    let mut seen = std::collections::HashSet::new();
    loop {
        if !seen.insert(current.clone()) {
            return Err(format!("Version inheritance loop at {current}"));
        }
        let entry = manifest
            .get("versions")
            .and_then(|v| v.as_array())
            .and_then(|rows| {
                rows.iter().find(|row| {
                    row.get("id").and_then(|v| v.as_str()) == Some(current.as_str())
                })
            })
            .ok_or_else(|| format!("Minecraft version {current} was not found in Mojang's catalog."))?;
        let url = entry
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Version {current} is missing a manifest URL."))?;
        let sha1 = entry.get("sha1").and_then(|v| v.as_str());
        let dest = minecraft_root
            .join("versions")
            .join(&current)
            .join(format!("{current}.json"));
        download_file(client, url, &dest, sha1, 0, |_, _| {}).await?;
        let doc = serde_json::from_str::<Value>(
            &fs::read_to_string(&dest)
                .map_err(|e| format!("Read version json {}: {e}", dest.display()))?,
        )
        .map_err(|e| format!("Parse version json {}: {e}", dest.display()))?;
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
    Ok(chain)
}

#[tauri::command]
pub async fn list_mojang_versions() -> Result<Vec<MojangVersionInfo>, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("HTTP client: {e}"))?;
    let manifest = http_get_json(&client, MANIFEST_URL).await?;
    let latest_release = manifest
        .pointer("/latest/release")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let latest_snapshot = manifest
        .pointer("/latest/snapshot")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let rows = manifest
        .get("versions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Mojang version manifest was malformed".to_string())?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let id = row.get("id")?.as_str()?.to_string();
            Some(MojangVersionInfo {
                version_type: row
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("release")
                    .to_string(),
                release_time: row
                    .get("releaseTime")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: row.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                sha1: row
                    .get("sha1")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                latest_release: id == latest_release,
                latest_snapshot: id == latest_snapshot,
                id,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn install_mojang_version(
    app: AppHandle,
    version_id: String,
    minecraft_root: Option<String>,
) -> Result<MojangInstallResult, String> {
    let version_id = version_id.trim().to_string();
    if version_id.is_empty() {
        return Err("Pick a Minecraft version.".into());
    }
    let root = minecraft_root
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_minecraft_root);
    ensure_minecraft_root(&root)?;
    let job_id = format!("mojang-{version_id}");
    let display = format!("Minecraft {version_id}");
    let gate = Arc::new(ProgressThrottle::new(150));

    emit_job_progress(&gate, &app, &job_id, "job", &display, "queued", 0, 1, None);

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| format!("HTTP client: {e}"))?;

    emit_job_progress(&gate, &app, &job_id, "job", &display, "downloading", 0, 1, None);
    let manifest = http_get_json(&client, MANIFEST_URL).await.map_err(|err| {
        emit_job_progress(
            &gate,
            &app,
            &job_id,
            "job",
            &display,
            "error",
            0,
            1,
            Some(err.clone()),
        );
        err
    })?;

    let docs = fetch_version_docs(&client, &manifest, &version_id, &root)
        .await
        .map_err(|err| {
            emit_job_progress(
                &gate,
                &app,
                &job_id,
                "job",
                &display,
                "error",
                0,
                1,
                Some(err.clone()),
            );
            err
        })?;

    let leaf = docs
        .first()
        .ok_or_else(|| "Version manifest chain was empty".to_string())?;
    let java_major = leaf
        .pointer("/javaVersion/majorVersion")
        .and_then(|v| v.as_u64())
        .map(|n| n as u32);

    let mut items: Vec<FetchItem> = Vec::new();
    for doc in &docs {
        items.extend(collect_client_items(&root, doc));
        items.extend(collect_library_items(&root, doc));
    }

    // Asset index from the first doc that defines one (usually the leaf / vanilla parent).
    let mut asset_index_id = String::new();
    let mut asset_index_url = String::new();
    let mut asset_index_sha1: Option<String> = None;
    let mut asset_index_size: u64 = 0;
    for doc in docs.iter().rev() {
        if let Some(ai) = doc.get("assetIndex") {
            asset_index_id = ai
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            asset_index_url = ai.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            asset_index_sha1 = ai
                .get("sha1")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            asset_index_size = ai.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
        }
    }
    if !asset_index_url.is_empty() && !asset_index_id.is_empty() {
        let index_path = root
            .join("assets")
            .join("indexes")
            .join(format!("{asset_index_id}.json"));
        items.push(FetchItem {
            url: asset_index_url.clone(),
            dest: index_path,
            sha1: asset_index_sha1.clone(),
            size: asset_index_size,
            label: format!("{asset_index_id}.json"),
        });
    }

    let mut downloaded_files: u32 = 0;
    let mut skipped_files: u32 = 0;
    let known_total: u64 = items.iter().map(|i| i.size.max(1)).sum();
    let mut done_bytes: u64 = 0;

    for item in &items {
        match download_file(
            &client,
            &item.url,
            &item.dest,
            item.sha1.as_deref(),
            item.size,
            |_, _| {},
        )
        .await
        {
            Ok(true) => downloaded_files += 1,
            Ok(false) => skipped_files += 1,
            Err(err) => {
                emit_job_progress(
                    &gate,
                    &app,
                    &job_id,
                    "job",
                    &display,
                    "error",
                    done_bytes,
                    known_total.max(1),
                    Some(err.clone()),
                );
                return Err(err);
            }
        }
        done_bytes = done_bytes.saturating_add(item.size.max(1));
        emit_job_progress(
            &gate,
            &app,
            &job_id,
            "job",
            &display,
            "downloading",
            done_bytes,
            known_total.max(1),
            None,
        );
    }

    if !asset_index_id.is_empty() {
        let index_path = root
            .join("assets")
            .join("indexes")
            .join(format!("{asset_index_id}.json"));
        let index: Value = serde_json::from_str(
            &fs::read_to_string(&index_path)
                .map_err(|e| format!("Read asset index: {e}"))?,
        )
        .map_err(|e| format!("Parse asset index: {e}"))?;
        let assets = collect_asset_items(&root, &index);
        let asset_total: u64 = assets.iter().map(|a| a.size.max(1)).sum::<u64>().max(1);
        let progress = Arc::new(AtomicU64::new(0));
        let downloaded = Arc::new(AtomicU64::new(0));
        let skipped = Arc::new(AtomicU64::new(0));
        let client = Arc::new(client.clone());
        let app_for_assets = app.clone();
        let job = job_id.clone();
        let display_assets = display.clone();

        let mut stream = futures_util::stream::iter(assets.into_iter().map(|item| {
            let client = client.clone();
            let progress = progress.clone();
            let downloaded = downloaded.clone();
            let skipped = skipped.clone();
            let app = app_for_assets.clone();
            let job = job.clone();
            let display_assets = display_assets.clone();
            let gate = gate.clone();
            async move {
                let result = download_file(
                    &client,
                    &item.url,
                    &item.dest,
                    item.sha1.as_deref(),
                    item.size,
                    |_, _| {},
                )
                .await;
                match result {
                    Ok(true) => {
                        downloaded.fetch_add(1, Ordering::Relaxed);
                    }
                    Ok(false) => {
                        skipped.fetch_add(1, Ordering::Relaxed);
                    }
                    Err(err) => return Err(err),
                }
                let so_far = progress.fetch_add(item.size.max(1), Ordering::Relaxed)
                    + item.size.max(1);
                emit_job_progress(
                    &gate,
                    &app,
                    &job,
                    "assets",
                    &display_assets,
                    "downloading",
                    so_far,
                    asset_total,
                    None,
                );
                Ok(())
            }
        }))
        .buffer_unordered(ASSET_CONCURRENCY);

        while let Some(result) = stream.next().await {
            if let Err(err) = result {
                emit_job_progress(
                    &gate,
                    &app,
                    &job_id,
                    "job",
                    &display,
                    "error",
                    0,
                    1,
                    Some(err.clone()),
                );
                return Err(err);
            }
        }
        downloaded_files += downloaded.load(Ordering::Relaxed) as u32;
        skipped_files += skipped.load(Ordering::Relaxed) as u32;
    }

    emit_job_progress(
        &gate,
        &app,
        &job_id,
        "job",
        &display,
        "installing",
        1,
        1,
        None,
    );
    let (instance_path, _created) =
        crate::instances::ensure_instance_dir(&version_id, "Vanilla")?;
    let version_path = root.join("versions").join(&version_id);

    emit_job_progress(&gate, &app, &job_id, "job", &display, "done", 1, 1, None);

    Ok(MojangInstallResult {
        version_id,
        instance_path: instance_path.to_string_lossy().to_string(),
        version_path: version_path.to_string_lossy().to_string(),
        java_major,
        downloaded_files,
        skipped_files,
    })
}
