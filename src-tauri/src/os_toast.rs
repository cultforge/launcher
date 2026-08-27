//! Native OS toast notifications (Windows). Used for experimental launcher alerts.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsToastArgs {
    pub title: String,
    pub body: String,
    /// Stable id used as the Windows toast tag (dedupe / replace).
    pub tag: String,
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Show a Windows toast. No-op on non-Windows. Click handling is done in-app via
/// notification drawer / deep links; the toast is informational.
#[tauri::command]
pub fn show_os_notification(args: OsToastArgs) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let title = escape_xml(args.title.trim());
        let body = escape_xml(args.body.trim());
        let tag = escape_xml(
            args.tag
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .take(64)
                .collect::<String>()
                .as_str(),
        );
        if title.is_empty() {
            return Ok(());
        }
        // WinRT toast via PowerShell — no extra Rust crate required.
        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>{title}</text>
      <text>{body}</text>
    </binding>
  </visual>
</toast>
"@
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
$toast.Tag = '{tag}'
$toast.Group = 'CultForge'
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('CultForge.Launcher')
$notifier.Show($toast)
"#,
            title = title,
            body = body,
            tag = tag
        );
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("Toast spawn failed: {e}"))?;
        if !status.success() {
            return Err("Windows toast failed".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = args;
        Ok(())
    }
}
