use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use url::Url;

const ALLOWED_HOSTS: &[&str] = &[
    "cdn.modrinth.com",
    "cdn.modrinthusercontent.com",
    "launcher-files.modrinth.com",
];

pub fn assert_allowed_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw).map_err(|e| format!("Invalid download URL: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("Only https download URLs are allowed".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Download URL missing host".to_string())?;
    if !ALLOWED_HOSTS.iter().any(|allowed| host.eq_ignore_ascii_case(allowed)) {
        return Err(format!("Download host not allowlisted: {host}"));
    }
    Ok(parsed)
}

pub fn cache_paths(cache_root: &str, sha512: &str, filename: &str) -> Result<(PathBuf, PathBuf), String> {
    let safe = crate::downloads::install::sanitize_filename(filename)?;
    let dir = Path::new(cache_root).join(sha512.to_lowercase());
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
        if *cancelled.borrow() {
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
