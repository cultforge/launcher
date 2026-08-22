use sha2::{Digest, Sha512};
use std::path::Path;
use tokio::fs;
use tokio::io::AsyncReadExt;

/// Normalize guild/Modrinth SHA-512 strings (hex or standard base64) to lowercase hex.
pub fn normalize_sha512(raw: &str) -> String {
    let trimmed = raw.trim();
    let stripped = trimmed
        .strip_prefix("sha512:")
        .or_else(|| trimmed.strip_prefix("SHA512:"))
        .unwrap_or(trimmed)
        .trim();

    if stripped.len() == 128 && stripped.chars().all(|c| c.is_ascii_hexdigit()) {
        return stripped.to_ascii_lowercase();
    }

    use base64::Engine;
    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(stripped) {
        if bytes.len() == 64 {
            return hex::encode(bytes);
        }
    }
    if let Ok(bytes) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(stripped) {
        if bytes.len() == 64 {
            return hex::encode(bytes);
        }
    }

    stripped.to_ascii_lowercase()
}

pub fn sha512_equal(actual_hex: &str, expected: &str) -> bool {
    normalize_sha512(actual_hex) == normalize_sha512(expected)
}

pub async fn sha512_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .await
        .map_err(|e| format!("Failed to open file for hashing: {e}"))?;
    let mut hasher = Sha512::new();
    let mut buffer = vec![0u8; 1024 * 64];
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read file for hashing: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn assert_sha512(actual: &str, expected: &str) -> Result<(), String> {
    if sha512_equal(actual, expected) {
        Ok(())
    } else {
        Err(format!(
            "SHA-512 mismatch (expected {}, got {})",
            normalize_sha512(expected),
            normalize_sha512(actual)
        ))
    }
}
