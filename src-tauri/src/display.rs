//! Display resolution presets for Configuration.

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayResolutions {
    pub max_width: u32,
    pub max_height: u32,
    pub presets: Vec<String>,
}

fn generate_presets(max_w: u32, max_h: u32) -> Vec<String> {
    const CANDIDATES: &[(u32, u32)] = &[
        (800, 600),
        (1024, 768),
        (1280, 720),
        (1280, 800),
        (1366, 768),
        (1440, 900),
        (1600, 900),
        (1680, 1050),
        (1920, 1080),
        (1920, 1200),
        (2560, 1080),
        (2560, 1440),
        (2560, 1600),
        (3440, 1440),
        (3840, 1600),
        (3840, 2160),
        (5120, 1440),
        (5120, 2160),
    ];
    let mut out = Vec::new();
    for (w, h) in CANDIDATES {
        if *w <= max_w && *h <= max_h {
            out.push(format!("{w}x{h}"));
        }
    }
    let max_label = format!("{max_w}x{max_h}");
    if !out.iter().any(|s| s == &max_label) {
        out.push(max_label);
    }
    out
}

#[tauri::command]
pub fn list_display_resolutions(app: AppHandle) -> Result<DisplayResolutions, String> {
    let mut max_w = 1920u32;
    let mut max_h = 1080u32;

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            max_w = ((size.width as f64) / scale).round().max(800.0) as u32;
            max_h = ((size.height as f64) / scale).round().max(600.0) as u32;
        } else if let Ok(Some(monitor)) = window.primary_monitor() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            max_w = ((size.width as f64) / scale).round().max(800.0) as u32;
            max_h = ((size.height as f64) / scale).round().max(600.0) as u32;
        }
    }

    Ok(DisplayResolutions {
        max_width: max_w,
        max_height: max_h,
        presets: generate_presets(max_w, max_h),
    })
}
