//! Local OS keyring for assistant API keys. Keys never leave this device / never
//! go to CultForge servers. There is intentionally no `get` command exposed to JS.

use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "CultForge";

fn entry_for(slot: &str) -> Result<Entry, String> {
    let trimmed = slot.trim();
    if trimmed.is_empty() {
        return Err("Missing secret slot".into());
    }
    let allowed = ["assistant.gemini", "assistant.openai"];
    if !allowed.contains(&trimmed) {
        return Err(format!("Secret slot not allowed: {trimmed}"));
    }
    Entry::new(SERVICE, trimmed).map_err(|e| format!("Keyring open failed: {e}"))
}

#[tauri::command]
pub fn secret_has(slot: String) -> Result<bool, String> {
    let entry = entry_for(&slot)?;
    match entry.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("Keyring read failed: {e}")),
    }
}

#[tauri::command]
pub fn secret_set(slot: String, value: String) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".into());
    }
    let entry = entry_for(&slot)?;
    entry
        .set_password(trimmed)
        .map_err(|e| format!("Keyring write failed: {e}"))
}

#[tauri::command]
pub fn secret_clear(slot: String) -> Result<(), String> {
    let entry = entry_for(&slot)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keyring delete failed: {e}")),
    }
}

pub fn read_secret(slot: &str) -> Result<String, String> {
    let entry = entry_for(slot)?;
    entry
        .get_password()
        .map_err(|e| match e {
            keyring::Error::NoEntry => format!("No API key saved for {slot}"),
            other => format!("Keyring read failed: {other}"),
        })
        .and_then(|v| {
            let t = v.trim().to_string();
            if t.is_empty() {
                Err(format!("No API key saved for {slot}"))
            } else {
                Ok(t)
            }
        })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    pub gemini: bool,
    pub openai: bool,
}

#[tauri::command]
pub fn secret_status() -> Result<SecretStatus, String> {
    Ok(SecretStatus {
        gemini: secret_has("assistant.gemini".into())?,
        openai: secret_has("assistant.openai".into())?,
    })
}
