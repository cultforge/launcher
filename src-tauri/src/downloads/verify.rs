use sha2::{Digest, Sha512};
use std::path::Path;
use tokio::fs;
use tokio::io::AsyncReadExt;

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
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(format!(
            "SHA-512 mismatch (expected {}, got {})",
            expected, actual
        ))
    }
}
