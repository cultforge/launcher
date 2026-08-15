use serde::Serialize;
use serde_json::Value;
use sha1::Digest as Sha1Digest;
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;
use url::Url;

const ALLOWED_IMAGE_HOSTS: &[&str] = &[
    "cdn.modrinth.com",
    "cdn.modrinthusercontent.com",
    "launcher-files.modrinth.com",
];

fn cache_dir(cache_root: &str, section: &str) -> PathBuf {
    Path::new(cache_root).join(".cultforge-cache").join(section)
}

fn is_safe_hash(hash: &str) -> bool {
    !hash.is_empty() && hash.len() <= 128 && hash.chars().all(|c| c.is_ascii_hexdigit())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHashes {
    pub sha1: String,
    pub sha512: String,
}

#[tauri::command]
pub async fn content_hash_file(path: String) -> Result<FileHashes, String> {
    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| format!("Failed to open {path}: {e}"))?;

    let mut sha1 = sha1::Sha1::new();
    let mut sha512 = sha2::Sha512::new();
    let mut buf = vec![0u8; 1024 * 512];
    loop {
        let read = file
            .read(&mut buf)
            .await
            .map_err(|e| format!("Failed reading {path}: {e}"))?;
        if read == 0 {
            break;
        }
        sha1.update(&buf[..read]);
        sha2::Digest::update(&mut sha512, &buf[..read]);
    }

    Ok(FileHashes {
        sha1: hex::encode(sha1.finalize()),
        sha512: hex::encode(sha2::Digest::finalize(sha512)),
    })
}

#[tauri::command]
pub async fn cache_get_meta(cache_root: String, sha1: String) -> Result<Option<Value>, String> {
    if !is_safe_hash(&sha1) {
        return Err("Invalid hash".into());
    }
    let path = cache_dir(&cache_root, "meta").join(format!("{}.json", sha1.to_lowercase()));
    match tokio::fs::read_to_string(&path).await {
        Ok(text) => Ok(serde_json::from_str(&text).ok()),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn cache_put_meta(cache_root: String, sha1: String, meta: Value) -> Result<(), String> {
    if !is_safe_hash(&sha1) {
        return Err("Invalid hash".into());
    }
    let dir = cache_dir(&cache_root, "meta");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create meta cache dir: {e}"))?;
    let path = dir.join(format!("{}.json", sha1.to_lowercase()));
    let text = serde_json::to_string(&meta).map_err(|e| format!("Invalid meta JSON: {e}"))?;
    tokio::fs::write(&path, text)
        .await
        .map_err(|e| format!("Failed writing meta cache: {e}"))
}

fn image_ext_from_url(url: &Url) -> &'static str {
    let path = url.path().to_lowercase();
    if path.ends_with(".webp") {
        "webp"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "jpg"
    } else if path.ends_with(".gif") {
        "gif"
    } else {
        "png"
    }
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "webp" => "image/webp",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

async fn find_cached_image(dir: &Path, sha1: &str) -> Option<PathBuf> {
    for ext in ["png", "webp", "jpg", "gif"] {
        let candidate = dir.join(format!("{sha1}.{ext}"));
        if tokio::fs::try_exists(&candidate).await.unwrap_or(false) {
            return Some(candidate);
        }
    }
    None
}

fn encode_data_url(bytes: &[u8], ext: &str) -> String {
    use base64::Engine;
    format!(
        "data:{};base64,{}",
        mime_for_ext(ext),
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

/// Returns the cached icon as a data URL. Downloads it first when `url` is
/// provided, the file is missing, and the host is allowlisted.
#[tauri::command]
pub async fn cache_ensure_image(
    cache_root: String,
    sha1: String,
    url: Option<String>,
) -> Result<Option<String>, String> {
    if !is_safe_hash(&sha1) {
        return Err("Invalid hash".into());
    }
    let sha1 = sha1.to_lowercase();
    let dir = cache_dir(&cache_root, "images");

    if let Some(existing) = find_cached_image(&dir, &sha1).await {
        let ext = existing
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_string();
        let bytes = tokio::fs::read(&existing)
            .await
            .map_err(|e| format!("Failed reading cached image: {e}"))?;
        return Ok(Some(encode_data_url(&bytes, &ext)));
    }

    let Some(raw_url) = url else {
        return Ok(None);
    };

    let parsed = Url::parse(&raw_url).map_err(|e| format!("Invalid image URL: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("Only https image URLs are allowed".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Image URL missing host".to_string())?;
    if !ALLOWED_IMAGE_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
    {
        return Err(format!("Image host not allowlisted: {host}"));
    }

    let client = reqwest::Client::builder()
        .user_agent("CultForge/2.4.0 (launcher)")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
    let response = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|e| format!("Image download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Image HTTP error: {e}"))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Image body error: {e}"))?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Image too large to cache".into());
    }

    let ext = image_ext_from_url(&parsed);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create image cache dir: {e}"))?;
    let path = dir.join(format!("{sha1}.{ext}"));
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| format!("Failed writing cached image: {e}"))?;

    Ok(Some(encode_data_url(&bytes, ext)))
}
