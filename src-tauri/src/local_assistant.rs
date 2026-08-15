//! Local assistant chat using user-owned API keys from the OS keyring.
//! The API key is read in Rust only and is never returned to the webview.

use serde::Deserialize;
use serde_json::{json, Value};

use crate::secrets;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChatRequest {
    /// `gemini` | `openai`
    pub provider: String,
    pub model: Option<String>,
    /// OpenAI-compatible base URL (default https://api.openai.com/v1)
    pub base_url: Option<String>,
    pub messages: Vec<LocalChatMessage>,
}

fn default_model(provider: &str) -> &'static str {
    match provider {
        "gemini" => "gemini-2.0-flash",
        _ => "gpt-4o-mini",
    }
}

fn pick_text(value: &Value, keys: &[&str]) -> Option<String> {
    let obj = value.as_object()?;
    for key in keys {
        if let Some(s) = obj.get(*key).and_then(|v| v.as_str()) {
            let t = s.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

async fn gemini_chat(api_key: &str, model: &str, messages: &[LocalChatMessage]) -> Result<String, String> {
    let mut contents = Vec::new();
    let mut system_bits = Vec::new();
    for msg in messages {
        let role = msg.role.trim().to_lowercase();
        let text = msg.content.trim();
        if text.is_empty() {
            continue;
        }
        if role == "system" {
            system_bits.push(text.to_string());
            continue;
        }
        let gemini_role = if role == "assistant" || role == "model" {
            "model"
        } else {
            "user"
        };
        contents.push(json!({
            "role": gemini_role,
            "parts": [{ "text": text }]
        }));
    }
    if contents.is_empty() {
        return Err("No messages to send".into());
    }

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    );
    let mut body = json!({ "contents": contents });
    if !system_bits.is_empty() {
        body["systemInstruction"] = json!({
            "parts": [{ "text": system_bits.join("\n\n") }]
        });
    }

    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .header("x-goog-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {e}"))?;
    let status = res.status();
    let raw: Value = res
        .json()
        .await
        .map_err(|e| format!("Gemini response parse failed: {e}"))?;
    if !status.is_success() {
        let msg = pick_text(&raw, &["error"])
            .or_else(|| {
                raw.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("Gemini error ({status})"));
        return Err(msg);
    }

    raw.pointer("/candidates/0/content/parts/0/text")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Gemini returned an empty response".into())
}

async fn openai_chat(
    api_key: &str,
    model: &str,
    base_url: &str,
    messages: &[LocalChatMessage],
) -> Result<String, String> {
    let base = base_url.trim().trim_end_matches('/');
    let url = format!("{base}/chat/completions");
    let payload_messages: Vec<Value> = messages
        .iter()
        .filter(|m| !m.content.trim().is_empty())
        .map(|m| {
            let role = match m.role.trim().to_lowercase().as_str() {
                "assistant" | "model" => "assistant",
                "system" => "system",
                _ => "user",
            };
            json!({ "role": role, "content": m.content.trim() })
        })
        .collect();
    if payload_messages.is_empty() {
        return Err("No messages to send".into());
    }

    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": payload_messages,
        }))
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {e}"))?;
    let status = res.status();
    let raw: Value = res
        .json()
        .await
        .map_err(|e| format!("OpenAI response parse failed: {e}"))?;
    if !status.is_success() {
        let msg = raw
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("OpenAI error ({status})"));
        return Err(msg);
    }

    raw.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "OpenAI returned an empty response".into())
}

#[tauri::command]
pub async fn local_assistant_chat(request: LocalChatRequest) -> Result<String, String> {
    let provider = request.provider.trim().to_lowercase();
    let model = request
        .model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default_model(&provider))
        .to_string();

    match provider.as_str() {
        "gemini" => {
            let key = secrets::read_secret("assistant.gemini")?;
            gemini_chat(&key, &model, &request.messages).await
        }
        "openai" => {
            let key = secrets::read_secret("assistant.openai")?;
            let base = request
                .base_url
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("https://api.openai.com/v1");
            openai_chat(&key, &model, base, &request.messages).await
        }
        other => Err(format!("Unsupported assistant provider: {other}")),
    }
}
