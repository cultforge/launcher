//! Install Fabric / Quilt / Forge / NeoForge on top of a Mojang vanilla version.

use crate::downloads::plan::{DownloadProgressEvent, ProgressThrottle};
use crate::java_runtime::{ensure_java, parse_java_major_hint};
use crate::mojang_install::{install_mojang_version, MojangInstallResult};
use crate::scanner::default_minecraft_root;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use url::Url;

const USER_AGENT: &str = "CultForge/2.4.0 (launcher; loader-install)";
const FABRIC_META: &str = "https://meta.fabricmc.net/v2";
const QUILT_META: &str = "https://meta.quiltmc.org/v3";
const FORGE_MAVEN: &str = "https://maven.minecraftforge.net";
const FORGE_PROMOS: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const FORGE_METADATA: &str =
    "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
const NEOFORGE_MAVEN: &str = "https://maven.neoforged.net/releases";
const NEOFORGE_METADATA: &str =
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
const NEOFORGE_PROMOS: &str =
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/promotions_slim.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderVersionInfo {
    pub version: String,
    pub stable: bool,
    pub recommended: bool,
    pub latest: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderInstallResult {
    pub version_id: String,
    pub instance_path: String,
    pub version_path: String,
    pub java_major: Option<u32>,
    pub downloaded_files: u32,
    pub skipped_files: u32,
    pub loader: String,
}

fn normalize_loader(loader: &str) -> Result<&'static str, String> {
    match loader.trim().to_ascii_lowercase().as_str() {
        "fabric" => Ok("fabric"),
        "quilt" => Ok("quilt"),
        "forge" => Ok("forge"),
        "neoforge" | "neo-forge" => Ok("neoforge"),
        "vanilla" => Err("Vanilla does not use the loader installer.".into()),
        other => Err(format!("Unsupported loader: {other}")),
    }
}

fn loader_label(loader: &str) -> &'static str {
    match loader {
        "fabric" => "Fabric",
        "quilt" => "Quilt",
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        _ => "Loader",
    }
}

fn assert_loader_host(url: &Url) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("Only https loader download URLs are allowed".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Loader URL missing host".to_string())?
        .to_ascii_lowercase();
    const ALLOWED: &[&str] = &[
        "meta.fabricmc.net",
        "maven.fabricmc.net",
        "meta.quiltmc.org",
        "maven.quiltmc.org",
        "maven.minecraftforge.net",
        "files.minecraftforge.net",
        "maven.neoforged.net",
        "libraries.minecraft.net",
        "piston-meta.mojang.com",
        "launchermeta.mojang.com",
        "piston-data.mojang.com",
        "launcher.mojang.com",
        "repo.spongepowered.org",
    ];
    if ALLOWED.iter().any(|h| host == *h)
        || host.ends_with(".minecraftforge.net")
        || host.ends_with(".neoforged.net")
    {
        return Ok(());
    }
    Err(format!("Loader download host not allowlisted: {host}"))
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

fn parse_maven_versions(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<version>") {
        rest = &rest[start + 9..];
        if let Some(end) = rest.find("</version>") {
            let v = rest[..end].trim();
            if !v.is_empty() {
                out.push(v.to_string());
            }
            rest = &rest[end + 10..];
        } else {
            break;
        }
    }
    out
}

fn neoforge_prefix(mc: &str) -> Option<String> {
    let mut parts = mc.split('.');
    let major = parts.next()?;
    let minor = parts.next()?;
    let patch = parts.next();
    if major != "1" {
        return None;
    }
    Some(match patch {
        Some(p) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => {
            format!("{minor}.{p}.")
        }
        _ => format!("{minor}.0."),
    })
}

fn java_cli_path(java: &str) -> PathBuf {
    let path = PathBuf::from(java);
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if name == "javaw.exe" {
        return path.with_file_name("java.exe");
    }
    if name == "javaw" {
        return path.with_file_name("java");
    }
    path
}

fn maven_artifact_path(name: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return Err(format!("Bad maven coordinate: {name}"));
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).copied();
    let file = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.jar"),
        None => format!("{artifact}-{version}.jar"),
    };
    let rel = format!("{group}/{artifact}/{version}/{file}");
    Ok((rel, file))
}

async fn http_get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let parsed = Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    assert_loader_host(&parsed)?;
    let res = client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed ({url}): {e}"))?
        .error_for_status()
        .map_err(|e| format!("HTTP error ({url}): {e}"))?;
    res.text()
        .await
        .map_err(|e| format!("Read body ({url}): {e}"))
}

async fn http_get_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    let parsed = Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    assert_loader_host(&parsed)?;
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
    mut on_progress: impl FnMut(u64, u64),
) -> Result<bool, String> {
    if dest.is_file() && fs::metadata(dest).map(|m| m.len() > 0).unwrap_or(false) {
        let size = fs::metadata(dest).map(|m| m.len()).unwrap_or(1);
        on_progress(size, size.max(1));
        return Ok(false);
    }
    let parsed = Url::parse(url).map_err(|e| format!("Invalid download URL: {e}"))?;
    assert_loader_host(&parsed)?;
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
    let total = response.content_length().unwrap_or(1).max(1);
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
    Ok(true)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| format!("HTTP client: {e}"))
}

async fn list_fabric_family(meta_base: &str, mc: &str) -> Result<Vec<LoaderVersionInfo>, String> {
    let client = http_client()?;
    let url = format!("{meta_base}/versions/loader/{mc}");
    let json = match http_get_json(&client, &url).await {
        Ok(v) => v,
        Err(err) if err.contains("404") || err.contains("HTTP error") => {
            return Ok(Vec::new());
        }
        Err(err) => return Err(err),
    };
    let rows = json.as_array().cloned().unwrap_or_default();
    let mut out = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        let loader = row.get("loader").unwrap_or(row);
        let version = loader
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if version.is_empty() {
            continue;
        }
        let stable = loader
            .get("stable")
            .and_then(|v| v.as_bool())
            .unwrap_or(index == 0);
        out.push(LoaderVersionInfo {
            version: version.to_string(),
            stable,
            recommended: false,
            latest: false,
        });
    }
    if let Some(first) = out.first_mut() {
        first.latest = true;
    }
    if let Some(stable) = out.iter_mut().find(|v| v.stable) {
        stable.recommended = true;
    } else if let Some(first) = out.first_mut() {
        first.recommended = true;
        first.stable = true;
    }
    Ok(out)
}

async fn list_forge_versions(mc: &str) -> Result<Vec<LoaderVersionInfo>, String> {
    let client = http_client()?;
    let xml = http_get_text(&client, FORGE_METADATA).await?;
    let prefix = format!("{mc}-");
    let mut versions: Vec<String> = parse_maven_versions(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .map(|v| v[prefix.len()..].to_string())
        .filter(|v| !v.is_empty())
        .collect();
    versions.reverse();
    let mut recommended = String::new();
    let mut latest = String::new();
    if let Ok(promos) = http_get_json(&client, FORGE_PROMOS).await {
        if let Some(map) = promos.get("promos").and_then(|v| v.as_object()) {
            if let Some(v) = map
                .get(&format!("{mc}-recommended"))
                .and_then(|v| v.as_str())
            {
                recommended = v.to_string();
            }
            if let Some(v) = map.get(&format!("{mc}-latest")).and_then(|v| v.as_str()) {
                latest = v.to_string();
            }
        }
    }
    if latest.is_empty() {
        latest = versions.first().cloned().unwrap_or_default();
    }
    if recommended.is_empty() {
        recommended = latest.clone();
    }
    Ok(versions
        .into_iter()
        .enumerate()
        .map(|(index, version)| LoaderVersionInfo {
            stable: version == recommended || version == latest,
            recommended: version == recommended,
            latest: version == latest || (latest.is_empty() && index == 0),
            version,
        })
        .collect())
}

async fn list_neoforge_versions(mc: &str) -> Result<Vec<LoaderVersionInfo>, String> {
    let Some(prefix) = neoforge_prefix(mc) else {
        return Ok(Vec::new());
    };
    let client = http_client()?;
    let xml = match http_get_text(&client, NEOFORGE_METADATA).await {
        Ok(v) => v,
        Err(err) if err.contains("404") => return Ok(Vec::new()),
        Err(err) => return Err(err),
    };
    let mut versions: Vec<String> = parse_maven_versions(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .collect();
    versions.reverse();
    let mut recommended = String::new();
    let mut latest = String::new();
    if let Ok(promos) = http_get_json(&client, NEOFORGE_PROMOS).await {
        if let Some(map) = promos.get("promos").and_then(|v| v.as_object()) {
            if let Some(v) = map
                .get(&format!("{mc}-recommended"))
                .or_else(|| map.get(&format!("{prefix}recommended")))
                .and_then(|v| v.as_str())
            {
                recommended = v.to_string();
            }
            if let Some(v) = map
                .get(&format!("{mc}-latest"))
                .or_else(|| map.get(&format!("{prefix}latest")))
                .and_then(|v| v.as_str())
            {
                latest = v.to_string();
            }
        }
    }
    if latest.is_empty() {
        latest = versions.first().cloned().unwrap_or_default();
    }
    if recommended.is_empty() {
        recommended = latest.clone();
    }
    Ok(versions
        .into_iter()
        .enumerate()
        .map(|(index, version)| LoaderVersionInfo {
            stable: version == recommended || version == latest,
            recommended: version == recommended,
            latest: version == latest || (latest.is_empty() && index == 0),
            version,
        })
        .collect())
}

#[tauri::command]
pub async fn list_loader_versions(
    loader: String,
    minecraft_version: String,
) -> Result<Vec<LoaderVersionInfo>, String> {
    let loader = normalize_loader(&loader)?;
    let mc = minecraft_version.trim();
    if mc.is_empty() {
        return Err("Pick a Minecraft version first.".into());
    }
    match loader {
        "fabric" => list_fabric_family(FABRIC_META, mc).await,
        "quilt" => list_fabric_family(QUILT_META, mc).await,
        "forge" => list_forge_versions(mc).await,
        "neoforge" => list_neoforge_versions(mc).await,
        _ => Err(format!("Unsupported loader: {loader}")),
    }
}

fn forge_maven_version(mc: &str, loader_version: &str) -> String {
    let trimmed = loader_version.trim();
    if trimmed.starts_with(mc) && trimmed.contains('-') {
        trimmed.to_string()
    } else {
        format!("{mc}-{trimmed}")
    }
}

fn forge_loader_only(mc: &str, maven_or_loader: &str) -> String {
    let trimmed = maven_or_loader.trim();
    let prefix = format!("{mc}-");
    if let Some(rest) = trimmed.strip_prefix(&prefix) {
        rest.to_string()
    } else {
        trimmed.to_string()
    }
}

async fn download_profile_libraries(
    app: &AppHandle,
    gate: &ProgressThrottle,
    job_id: &str,
    display: &str,
    client: &reqwest::Client,
    minecraft_root: &Path,
    profile: &Value,
) -> Result<(u32, u32), String> {
    let libs = profile
        .get("libraries")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut downloaded = 0u32;
    let mut skipped = 0u32;
    let total = libs.len().max(1) as u64;
    for (index, lib) in libs.iter().enumerate() {
        let artifact = lib.get("downloads").and_then(|v| v.get("artifact"));
        let name = lib
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if name.is_empty() && artifact.is_none() {
            continue;
        }
        let rel = artifact
            .and_then(|v| v.get("path"))
            .and_then(|v| v.as_str())
            .map(|s| s.replace('\\', "/"))
            .filter(|s| !s.is_empty())
            .or_else(|| maven_artifact_path(name).ok().map(|(rel, _)| rel))
            .ok_or_else(|| format!("Bad maven coordinate: {name}"))?;
        let dest = minecraft_root.join("libraries").join(&rel);
        if dest.is_file() {
            skipped += 1;
            emit_job_progress(
                gate,
                app,
                job_id,
                "job",
                display,
                "downloading",
                (index as u64) + 1,
                total,
                None,
            );
            continue;
        }
        let mut urls: Vec<String> = Vec::new();
        if let Some(url) = artifact.and_then(|v| v.get("url")).and_then(|v| v.as_str()) {
            if !url.trim().is_empty() {
                urls.push(url.trim().to_string());
            }
        }
        if let Some(base) = lib.get("url").and_then(|v| v.as_str()) {
            let mut base = base.trim().to_string();
            if !base.ends_with('/') {
                base.push('/');
            }
            urls.push(format!("{base}{rel}"));
        }
        for base in [
            "https://libraries.minecraft.net/",
            "https://maven.fabricmc.net/",
            "https://maven.quiltmc.org/repository/release/",
            "https://repo.spongepowered.org/maven/",
        ] {
            urls.push(format!("{base}{rel}"));
        }
        let mut ok = false;
        let mut last_err = String::new();
        for url in urls {
            match download_file(client, &url, &dest, |_, _| {}).await
            {
                Ok(true) => {
                    downloaded += 1;
                    ok = true;
                    break;
                }
                Ok(false) => {
                    skipped += 1;
                    ok = true;
                    break;
                }
                Err(err) => last_err = err,
            }
        }
        if !ok {
            return Err(format!("Could not download {name}: {last_err}"));
        }
        emit_job_progress(
            gate,
            app,
            job_id,
            "job",
            display,
            "downloading",
            (index as u64) + 1,
            total,
            None,
        );
    }
    Ok((downloaded, skipped))
}

async fn install_fabric_family(
    app: &AppHandle,
    gate: &ProgressThrottle,
    job_id: &str,
    display: &str,
    meta_base: &str,
    loader_name: &str,
    mc: &str,
    loader_version: &str,
    minecraft_root: &Path,
) -> Result<(String, u32, u32), String> {
    let client = http_client()?;
    let url = format!("{meta_base}/versions/loader/{mc}/{loader_version}/profile/json");
    emit_job_progress(gate, app, job_id, "job", display, "downloading", 0, 1, None);
    let profile = http_get_json(&client, &url).await?;
    let version_id = profile
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("{mc}-{loader_name}-{loader_version}"));
    let dir = minecraft_root.join("versions").join(&version_id);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Create version dir: {e}"))?;
    let json_path = dir.join(format!("{version_id}.json"));
    let pretty = serde_json::to_string_pretty(&profile)
        .map_err(|e| format!("Serialize loader profile: {e}"))?;
    tokio::fs::write(&json_path, pretty)
        .await
        .map_err(|e| format!("Write loader profile: {e}"))?;
    let (downloaded, skipped) =
        download_profile_libraries(app, gate, job_id, display, &client, minecraft_root, &profile).await?;
    Ok((version_id, downloaded, skipped))
}

async fn run_installer(
    java: &Path,
    installer: &Path,
    minecraft_root: &Path,
) -> Result<String, String> {
    let java = java.to_path_buf();
    let installer = installer.to_path_buf();
    let root = minecraft_root.to_path_buf();
    let output = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&java);
        cmd.arg("-Djava.awt.headless=true")
            .arg("-jar")
            .arg(&installer)
            .arg("--installClient")
            .arg(&root)
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.output()
    })
    .await
    .map_err(|e| format!("Installer task failed: {e}"))?
    .map_err(|e| format!("Failed to start loader installer: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let log = format!("{stdout}\n{stderr}");
    if !output.status.success() {
        let snippet: String = log
            .lines()
            .rev()
            .filter(|l| !l.trim().is_empty())
            .take(12)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "Loader installer failed ({}).\n{snippet}",
            output.status
        ));
    }
    Ok(log)
}

fn write_installer_log(minecraft_root: &Path, version_id: &str, log: &str) {
    let path = minecraft_root
        .join("versions")
        .join(version_id)
        .join("cultforge-installer.log");
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = File::create(path) {
        let _ = file.write_all(log.as_bytes());
    }
}

fn name_matches_loader(name: &str, loader: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    match loader {
        "neoforge" => lower.contains("neoforge"),
        "forge" => lower.contains("forge") && !lower.contains("neoforge"),
        other => lower.contains(other),
    }
}

fn find_installed_version(minecraft_root: &Path, expected: &str, loader: &str) -> Option<String> {
    let expected_dir = minecraft_root.join("versions").join(expected);
    if expected_dir.join(format!("{expected}.json")).is_file() {
        return Some(expected.to_string());
    }
    let versions = minecraft_root.join("versions");
    let entries = fs::read_dir(versions).ok()?;
    let mut matches: Vec<(u64, String)> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name_matches_loader(&name, loader) {
            continue;
        }
        let json = entry.path().join(format!("{name}.json"));
        if !json.is_file() {
            continue;
        }
        let modified = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        matches.push((modified, name));
    }
    matches.sort_by(|a, b| b.0.cmp(&a.0));
    matches.into_iter().next().map(|(_, name)| name)
}

fn java_hint_for_mc(mc: &str, vanilla: &MojangInstallResult) -> String {
    if let Some(major) = vanilla.java_major {
        return major.to_string();
    }
    parse_java_major_hint(mc)
        .or(Some(21))
        .map(|n| n.to_string())
        .unwrap_or_else(|| "21".into())
}

#[tauri::command]
pub async fn install_loader_build(
    app: AppHandle,
    minecraft_version: String,
    loader: String,
    loader_version: String,
    minecraft_root: Option<String>,
) -> Result<LoaderInstallResult, String> {
    let loader = normalize_loader(&loader)?;
    let mc = minecraft_version.trim().to_string();
    let loader_version = loader_version.trim().to_string();
    if mc.is_empty() {
        return Err("Pick a Minecraft version.".into());
    }
    if loader_version.is_empty() {
        return Err(format!("Pick a {} version.", loader_label(loader)));
    }
    let root = minecraft_root
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_minecraft_root);
    let job_id = format!("loader-{mc}-{loader}-{loader_version}");
    let display = format!("{} {} · MC {mc}", loader_label(loader), loader_version);
    let gate = std::sync::Arc::new(ProgressThrottle::new(150));

    emit_job_progress(&gate, &app, &job_id, "job", &display, "queued", 0, 1, None);

    let vanilla = install_mojang_version(
        app.clone(),
        mc.clone(),
        Some(root.to_string_lossy().to_string()),
    )
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

    emit_job_progress(&gate, &app, &job_id, "job", &display, "downloading", 0, 1, None);

    let (version_id, extra_downloaded, extra_skipped) = match loader {
        "fabric" => {
            install_fabric_family(
                &app,
                &gate,
                &job_id,
                &display,
                FABRIC_META,
                "fabric",
                &mc,
                &loader_version,
                &root,
            )
            .await
        }
        "quilt" => {
            install_fabric_family(
                &app,
                &gate,
                &job_id,
                &display,
                QUILT_META,
                "quilt",
                &mc,
                &loader_version,
                &root,
            )
            .await
        }
        "forge" | "neoforge" => {
            let java_hint = java_hint_for_mc(&mc, &vanilla);
            let java = ensure_java(app.clone(), Some(java_hint), Some(true))
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
            let java_bin = java_cli_path(&java.path);
            if !java_bin.is_file() {
                return Err(format!(
                    "Java runtime is missing java.exe at {}",
                    java_bin.display()
                ));
            }
            let cache = root.join("cultforge-cache").join("installers");
            tokio::fs::create_dir_all(&cache)
                .await
                .map_err(|e| format!("Create installer cache: {e}"))?;
            let client = http_client()?;
            let (url, filename, expected_id) = if loader == "forge" {
                let maven_ver = forge_maven_version(&mc, &loader_version);
                let forge_only = forge_loader_only(&mc, &loader_version);
                (
                    format!("{FORGE_MAVEN}/net/minecraftforge/forge/{maven_ver}/forge-{maven_ver}-installer.jar"),
                    format!("forge-{maven_ver}-installer.jar"),
                    format!("{mc}-forge-{forge_only}"),
                )
            } else {
                (
                    format!("{NEOFORGE_MAVEN}/net/neoforged/neoforge/{loader_version}/neoforge-{loader_version}-installer.jar"),
                    format!("neoforge-{loader_version}-installer.jar"),
                    format!("{mc}-neoforge-{loader_version}"),
                )
            };
            let installer_path = cache.join(&filename);
            emit_job_progress(
                &gate,
                &app,
                &job_id,
                "job",
                &display,
                "downloading",
                0,
                1,
                None,
            );
            let downloaded = download_file(&client, &url, &installer_path, |_, _| {})
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
            emit_job_progress(&gate, &app, &job_id, "job", &display, "installing", 0, 1, None);
            let log = run_installer(&java_bin, &installer_path, &root)
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
            let version_id = find_installed_version(&root, &expected_id, loader).ok_or_else(
                || {
                    format!(
                        "{} installer finished but no version profile was created. Expected {}.",
                        loader_label(loader),
                        expected_id
                    )
                },
            )?;
            write_installer_log(&root, &version_id, &log);
            Ok((version_id, if downloaded { 1 } else { 0 }, if downloaded { 0 } else { 1 }))
        }
        _ => Err(format!("Unsupported loader: {loader}")),
    }?;

    emit_job_progress(&gate, &app, &job_id, "job", &display, "installing", 1, 1, None);
    let (instance_path, _) =
        crate::instances::ensure_instance_dir(&version_id, loader_label(loader))?;
    let version_path = root.join("versions").join(&version_id);
    emit_job_progress(&gate, &app, &job_id, "job", &display, "done", 1, 1, None);

    Ok(LoaderInstallResult {
        version_id,
        instance_path: instance_path.to_string_lossy().to_string(),
        version_path: version_path.to_string_lossy().to_string(),
        java_major: vanilla.java_major,
        downloaded_files: vanilla.downloaded_files.saturating_add(extra_downloaded),
        skipped_files: vanilla.skipped_files.saturating_add(extra_skipped),
        loader: loader_label(loader).to_string(),
    })
}
