use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use url::Url;

const ALLOWED_HOSTS: &[&str] = &[
    "cdn.modrinth.com",
    "cdn.modrinthusercontent.com",
    "launcher-files.modrinth.com",
    "api.cultforge.com",
    "guilds.cultforge.com",
    "auth.cultforge.com",
    "libraries.minecraft.net",
    "piston-meta.mojang.com",
    "piston-data.mojang.com",
    "launcher.mojang.com",
    "maven.minecraftforge.net",
    "maven.neoforged.net",
    "maven.fabricmc.net",
    "meta.fabricmc.net",
    "maven.quiltmc.org",
    "github.com",
    "objects.githubusercontent.com",
    "raw.githubusercontent.com",
];

const ALLOWED_HOST_SUFFIXES: &[&str] = &[
    ".modrinth.com",
    ".modrinthusercontent.com",
    ".cultforge.com",
    ".r2.cloudflarestorage.com",
    ".cloudflarestorage.com",
    ".githubusercontent.com",
];

pub fn assert_allowed_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw).map_err(|e| format!("Invalid download URL: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("Only https download URLs are allowed".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Download URL missing host".to_string())?;
    let host_l = host.to_ascii_lowercase();
    let allowed = ALLOWED_HOSTS
        .iter()
        .any(|allowed| host_l.eq_ignore_ascii_case(allowed))
        || ALLOWED_HOST_SUFFIXES
            .iter()
            .any(|suffix| host_l.ends_with(suffix));
    if !allowed {
        return Err(format!("Download host not allowlisted: {host}"));
    }
    Ok(parsed)
}

pub fn cache_paths(cache_root: &str, sha512: &str, filename: &str) -> Result<(PathBuf, PathBuf), String> {
    let safe = crate::downloads::install::sanitize_filename(filename)?;
    let key = crate::downloads::verify::normalize_sha512(sha512);
    let dir = Path::new(cache_root).join(if key.is_empty() {
        sha512.to_lowercase()
    } else {
        key
    });
    let final_path = dir.join(&safe);
    let part_path = dir.join(format!("{safe}.part"));
    Ok((final_path, part_path))
}

pub async fn download_to_cache(
    client: &reqwest::Client,
    url: &str,
    cache_root: &str,
    sha512: &str,
    filename: &str,
    expected_size: u64,
    mut on_progress: impl FnMut(u64, u64),
    cancelled: &tokio::sync::watch::Receiver<bool>,
    abort: Option<&AtomicBool>,
) -> Result<PathBuf, String> {
    assert_allowed_url(url)?;
    let (final_path, part_path) = cache_paths(cache_root, sha512, filename)?;

    if final_path.exists() {
        on_progress(expected_size.max(1), expected_size.max(1));
        return Ok(final_path);
    }

    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create cache directory: {e}"))?;
    }

    if part_path.exists() {
        let _ = fs::remove_file(&part_path).await;
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Download HTTP error: {e}"))?;

    let total = response
        .content_length()
        .unwrap_or(expected_size)
        .max(expected_size)
        .max(1);

    let mut file = File::create(&part_path)
        .await
        .map_err(|e| format!("Failed to create temp download file: {e}"))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        if *cancelled.borrow() || abort.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
            let _ = fs::remove_file(&part_path).await;
            return Err("cancelled".into());
        }
        let bytes = chunk.map_err(|e| format!("Download stream error: {e}"))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("Failed writing download: {e}"))?;
        downloaded = downloaded.saturating_add(bytes.len() as u64);
        on_progress(downloaded, total);
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush download: {e}"))?;
    drop(file);

    fs::rename(&part_path, &final_path)
        .await
        .map_err(|e| format!("Failed to finalize cached download: {e}"))?;

    Ok(final_path)
}
