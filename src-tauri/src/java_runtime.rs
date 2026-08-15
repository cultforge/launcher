//! Download and manage per-major Java runtimes for CultForge builds.
//! Temurin JREs live under `%APPDATA%/CultForge/runtimes/java-{major}/`.

use crate::downloads::plan::DownloadProgressEvent;
use crate::launch::{parse_java_major, java_version_string, resolve_java, JavaInfo};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use url::Url;
use zip::ZipArchive;

const USER_AGENT: &str = "CultForge/2.4.0 (launcher; java-runtime)";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntimeInfo {
    pub path: String,
    pub version: Option<String>,
    pub major: Option<u32>,
    pub source: String,
    pub managed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RuntimeMeta {
    major: u32,
    version: String,
    vendor: String,
    javaw: String,
}

fn cultforge_root() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("CultForge");
    }
    PathBuf::from("CultForge")
}

pub fn runtimes_root() -> PathBuf {
    cultforge_root().join("runtimes")
}

pub fn parse_java_major_hint(hint: &str) -> Option<u32> {
    let lower = hint.trim().to_lowercase();
    let stripped = lower
        .trim_start_matches("java")
        .trim()
        .trim_start_matches("jdk")
        .trim()
        .trim_start_matches("jre")
        .trim();
    if stripped.starts_with("1.8")
        || stripped == "8"
        || stripped.starts_with("8.")
        || stripped.starts_with("8+")
    {
        return Some(8);
    }
    let digits: String = stripped.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok().filter(|&n| (8..=25).contains(&n))
}

/// Map an arbitrary required major onto a Temurin LTS we can download.
pub fn normalize_download_major(major: u32) -> u32 {
    match major {
        0..=8 => 8,
        9..=11 => 11,
        12..=17 => 17,
        _ => 21,
    }
}

fn java_bin_name() -> &'static str {
    if cfg!(windows) {
        "javaw.exe"
    } else {
        "java"
    }
}

pub fn managed_java_bins() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let root = runtimes_root();
    if !root.is_dir() {
        return out;
    }
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(bin) = find_java_bin(&path, 0) {
                out.push(bin);
            }
        }
    }
    out
}

fn find_java_bin(root: &Path, depth: u32) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }
    let direct = root.join("bin").join(java_bin_name());
    if direct.is_file() {
        return Some(direct);
    }
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_java_bin(&path, depth + 1) {
                return Some(found);
            }
        }
    }
    None
}

fn managed_dir_for(major: u32) -> PathBuf {
    runtimes_root().join(format!("java-{major}"))
}

fn read_managed(major: u32) -> Option<JavaRuntimeInfo> {
    let dir = managed_dir_for(major);
    if !dir.is_dir() {
        return None;
    }
    let meta_path = dir.join("runtime.json");
    if let Ok(raw) = fs::read_to_string(&meta_path) {
        if let Ok(meta) = serde_json::from_str::<RuntimeMeta>(&raw) {
            let bin = dir.join(&meta.javaw);
            if bin.is_file() {
                return Some(JavaRuntimeInfo {
                    path: bin.to_string_lossy().to_string(),
                    version: Some(meta.version),
                    major: Some(meta.major),
                    source: "cultforge".into(),
                    managed: true,
                });
            }
        }
    }
    let bin = find_java_bin(&dir, 0)?;
    let ver = java_version_string(&bin);
    Some(JavaRuntimeInfo {
        path: bin.to_string_lossy().to_string(),
        version: ver.clone(),
        major: ver.as_deref().and_then(parse_java_major).or(Some(major)),
        source: "cultforge".into(),
        managed: true,
    })
}

fn info_from_java(info: JavaInfo, managed: bool) -> JavaRuntimeInfo {
    let major = info.version.as_deref().and_then(parse_java_major);
    JavaRuntimeInfo {
        path: info.path,
        version: info.version,
        major,
        source: if managed { "cultforge" } else { "system" }.into(),
        managed,
    }
}

fn adoptium_os() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    }
}

fn adoptium_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    }
}

fn assert_java_download_host(url: &Url) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("Only https Java download URLs are allowed".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Java download URL missing host".to_string())?
        .to_ascii_lowercase();
    const ALLOWED: &[&str] = &[
        "api.adoptium.net",
        "github.com",
        "objects.githubusercontent.com",
        "github-releases.githubusercontent.com",
        "release-assets.githubusercontent.com",
        "downloads.adoptium.net",
    ];
    if ALLOWED.iter().any(|h| host == *h) || host.ends_with(".githubusercontent.com") {
        return Ok(());
    }
    Err(format!("Java download host not allowlisted: {host}"))
}

#[derive(Debug, Clone)]
struct TemurinPackage {
    url: String,
    filename: String,
    sha256: Option<String>,
    size: u64,
    version: String,
}

fn pick_temurin_package(json: &serde_json::Value) -> Result<TemurinPackage, String> {
    let rows = json
        .as_array()
        .ok_or_else(|| "Adoptium assets response was not a list".to_string())?;
    for row in rows {
        let binary = row.get("binary").unwrap_or(row);
        let package = binary
            .get("package")
            .ok_or_else(|| "Adoptium asset missing package".to_string())?;
        let link = package
            .get("link")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let name = package
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if link.is_empty() {
            continue;
        }
        let lower_name = name.to_ascii_lowercase();
        let lower_link = link.to_ascii_lowercase();
        let is_archive = lower_name.ends_with(".zip")
            || lower_link.contains(".zip")
            || lower_name.ends_with(".tar.gz")
            || lower_link.contains(".tar.gz");
        if !is_archive {
            continue;
        }
        if cfg!(windows) && !(lower_name.ends_with(".zip") || lower_link.contains(".zip")) {
            continue;
        }
        let version = row
            .pointer("/version/openjdk_version")
            .or_else(|| row.pointer("/version/semver"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let filename = if name.trim().is_empty() {
            Url::parse(link)
                .ok()
                .and_then(|u| {
                    u.path_segments()
                        .and_then(|mut s| s.next_back())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| "temurin-jre.zip".into())
        } else {
            name.to_string()
        };
        return Ok(TemurinPackage {
            url: link.to_string(),
            filename,
            sha256: package
                .get("checksum")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            size: package.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
            version,
        });
    }
    Err("No Temurin JRE zip found for this platform".into())
}

fn emit_java_progress(
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

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_size: u64,
    mut on_progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let parsed = Url::parse(url).map_err(|e| format!("Invalid Java download URL: {e}"))?;
    assert_java_download_host(&parsed)?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create Java cache dir: {e}"))?;
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
        .map_err(|e| format!("Java download request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Java download HTTP error: {e}"))?;
    let total = response
        .content_length()
        .unwrap_or(expected_size)
        .max(expected_size)
        .max(1);
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| format!("Failed to create Java download file: {e}"))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Java download stream error: {e}"))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("Failed writing Java download: {e}"))?;
        downloaded = downloaded.saturating_add(bytes.len() as u64);
        on_progress(downloaded, total);
    }
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush Java download: {e}"))?;
    drop(file);
    tokio::fs::rename(&part, dest)
        .await
        .map_err(|e| format!("Failed to finalize Java download: {e}"))?;
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Open Java archive: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Hash Java archive: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn extract_zip(archive_path: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("Create Java extract dir: {e}"))?;
    let file = File::open(archive_path).map_err(|e| format!("Open Java zip: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Read Java zip: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Java zip entry: {e}"))?;
        let rel = entry
            .enclosed_name()
            .ok_or_else(|| "Unsafe path in Java zip".to_string())?
            .to_path_buf();
        let out = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| format!("Create {}: {e}", out.display()))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Create {}: {e}", parent.display()))?;
        }
        let mut outfile =
            File::create(&out).map_err(|e| format!("Write {}: {e}", out.display()))?;
        std::io::copy(&mut entry, &mut outfile)
            .map_err(|e| format!("Extract {}: {e}", out.display()))?;
    }
    Ok(())
}

fn write_runtime_meta(dir: &Path, major: u32, version: &str, javaw: &Path) -> Result<(), String> {
    let rel = javaw
        .strip_prefix(dir)
        .unwrap_or(javaw)
        .to_string_lossy()
        .replace('\\', "/");
    let meta = RuntimeMeta {
        major,
        version: version.to_string(),
        vendor: "temurin".into(),
        javaw: rel,
    };
    let json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Serialize Java runtime meta: {e}"))?;
    fs::write(dir.join("runtime.json"), json)
        .map_err(|e| format!("Write Java runtime meta: {e}"))?;
    Ok(())
}

async fn fetch_temurin_package(
    client: &reqwest::Client,
    major: u32,
) -> Result<TemurinPackage, String> {
    let url = format!(
        "https://api.adoptium.net/v3/assets/latest/{major}/hotspot?os={}&architecture={}&image_type=jre",
        adoptium_os(),
        adoptium_arch()
    );
    let res = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Adoptium lookup failed: {e}"))?;
    if res.status().is_success() {
        let json: serde_json::Value = res
            .json()
            .await
            .map_err(|e| format!("Adoptium JSON failed: {e}"))?;
        if let Ok(pkg) = pick_temurin_package(&json) {
            return Ok(pkg);
        }
    }
    let fallback = format!(
        "https://api.adoptium.net/v3/assets/latest/{major}/hotspot?os={}&architecture={}&image_type=jdk",
        adoptium_os(),
        adoptium_arch()
    );
    let json: serde_json::Value = client
        .get(&fallback)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Adoptium JDK lookup failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Adoptium JDK HTTP error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Adoptium JDK JSON failed: {e}"))?;
    pick_temurin_package(&json)
}

fn usable_existing(preferred_major: Option<u32>) -> Option<JavaRuntimeInfo> {
    if let Some(major) = preferred_major {
        if let Some(managed) = read_managed(major) {
            let have = managed.major.unwrap_or(0);
            if have >= major {
                return Some(managed);
            }
        }
        // Also accept a managed LTS that covers this requirement (e.g. 21 for 17+).
        let download_major = normalize_download_major(major);
        if download_major != major {
            if let Some(managed) = read_managed(download_major) {
                let have = managed.major.unwrap_or(0);
                if have >= major {
                    return Some(managed);
                }
            }
        }
    } else if let Some(managed) = read_managed(21).or_else(|| read_managed(17)) {
        return Some(managed);
    }

    match resolve_java(preferred_major) {
        Ok(info) => {
            let have = info.version.as_deref().and_then(parse_java_major);
            if let Some(want) = preferred_major {
                if have.unwrap_or(0) >= want {
                    let path_lc = info.path.replace('\\', "/").to_lowercase();
                    let managed = path_lc.contains("/cultforge/runtimes/");
                    return Some(info_from_java(info, managed));
                }
                return None;
            }
            let path_lc = info.path.replace('\\', "/").to_lowercase();
            let managed = path_lc.contains("/cultforge/runtimes/");
            Some(info_from_java(info, managed))
        }
        Err(_) => None,
    }
}

#[tauri::command]
pub fn list_java_runtimes() -> Result<Vec<JavaRuntimeInfo>, String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for major in [8u32, 11, 17, 21] {
        if let Some(info) = read_managed(major) {
            seen.insert(info.path.to_lowercase());
            out.push(info);
        }
    }
    if let Ok(info) = resolve_java(None) {
        if seen.insert(info.path.to_lowercase()) {
            let path_lc = info.path.replace('\\', "/").to_lowercase();
            out.push(info_from_java(
                info,
                path_lc.contains("/cultforge/runtimes/"),
            ));
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn ensure_java(
    app: AppHandle,
    java_hint: Option<String>,
    download_if_missing: Option<bool>,
) -> Result<JavaRuntimeInfo, String> {
    let preferred = java_hint
        .as_deref()
        .and_then(parse_java_major_hint);
    if let Some(existing) = usable_existing(preferred) {
        return Ok(existing);
    }

    if download_if_missing == Some(false) {
        return Err(match preferred {
            Some(m) => format!(
                "Java {m} is required for this build. Install it from Settings → Paths & Java."
            ),
            None => "No Java runtime found. Install Temurin from Settings → Paths & Java.".into(),
        });
    }

    let major = normalize_download_major(preferred.unwrap_or(21));
    let job_id = format!("java-runtime-{major}");
    let display = format!("Java {major} (Temurin JRE)");

    emit_java_progress(&app, &job_id, "job", &display, "queued", 0, 1, None);

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| format!("Failed to create Java HTTP client: {e}"))?;

    emit_java_progress(&app, &job_id, "job", &display, "downloading", 0, 1, None);

    let package = match fetch_temurin_package(&client, major).await {
        Ok(pkg) => pkg,
        Err(err) => {
            emit_java_progress(
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
    };

    let cache_dir = runtimes_root().join("cache");
    let archive_path = cache_dir.join(&package.filename);
    if !archive_path.is_file() {
        if let Err(err) = download_file(
            &client,
            &package.url,
            &archive_path,
            package.size,
            |downloaded, total| {
                emit_java_progress(
                    &app,
                    &job_id,
                    "package",
                    &package.filename,
                    "downloading",
                    downloaded,
                    total,
                    None,
                );
            },
        )
        .await
        {
            emit_java_progress(
                &app,
                &job_id,
                "job",
                &display,
                "error",
                0,
                package.size.max(1),
                Some(err.clone()),
            );
            return Err(err);
        }
    } else {
        emit_java_progress(
            &app,
            &job_id,
            "package",
            &package.filename,
            "downloading",
            package.size.max(1),
            package.size.max(1),
            None,
        );
    }

    emit_java_progress(
        &app,
        &job_id,
        "package",
        &package.filename,
        "verifying",
        package.size.max(1),
        package.size.max(1),
        None,
    );

    if let Some(expected) = package.sha256.as_deref().filter(|s| !s.is_empty()) {
        let actual = sha256_file(&archive_path)?;
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = fs::remove_file(&archive_path);
            let err = format!("Java archive SHA-256 mismatch (expected {expected}, got {actual})");
            emit_java_progress(
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

    emit_java_progress(
        &app,
        &job_id,
        "package",
        &display,
        "installing",
        package.size.max(1),
        package.size.max(1),
        None,
    );

    let dest = managed_dir_for(major);
    let tmp = runtimes_root().join(format!("java-{major}.tmp"));
    if tmp.exists() {
        let _ = fs::remove_dir_all(&tmp);
    }
    if dest.exists() {
        let _ = fs::remove_dir_all(&dest);
    }

    let extract_result = if package
        .filename
        .to_ascii_lowercase()
        .ends_with(".zip")
        || archive_path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
    {
        extract_zip(&archive_path, &tmp)
    } else {
        Err(
            "Only zip Java archives are supported on this platform. Try installing Temurin manually."
                .into(),
        )
    };

    if let Err(err) = extract_result {
        let _ = fs::remove_dir_all(&tmp);
        emit_java_progress(
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

    fs::create_dir_all(runtimes_root())
        .map_err(|e| format!("Create runtimes folder: {e}"))?;
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_dir_all(&tmp);
        format!("Install Java runtime: {e}")
    })?;

    let bin = find_java_bin(&dest, 0).ok_or_else(|| {
        let _ = fs::remove_dir_all(&dest);
        "Extracted Java runtime is missing javaw/java".to_string()
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&bin)
            .map_err(|e| format!("Java bin metadata: {e}"))?
            .permissions();
        perms.set_mode(perms.mode() | 0o111);
        let _ = fs::set_permissions(&bin, perms);
    }

    write_runtime_meta(&dest, major, &package.version, &bin)?;
    let ver = java_version_string(&bin).or(Some(package.version.clone()));

    // Smoke-check the binary actually runs.
    let _ = Command::new(&bin).arg("-version").output();

    emit_java_progress(
        &app,
        &job_id,
        "job",
        &display,
        "done",
        package.size.max(1),
        package.size.max(1),
        None,
    );

    Ok(JavaRuntimeInfo {
        path: bin.to_string_lossy().to_string(),
        version: ver,
        major: Some(major),
        source: "cultforge".into(),
        managed: true,
    })
}
