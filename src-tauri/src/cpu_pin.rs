//! Best-effort CPU pin + high priority for Minecraft (Windows experimental).

use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;

static AFFINITY_SNAPSHOT: Lazy<Mutex<HashMap<u32, usize>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Pick the last logical processor as the "dedicated" core mask bit.
pub fn dedicated_core_mask() -> Option<usize> {
    #[cfg(target_os = "windows")]
    {
        use std::mem::MaybeUninit;
        #[repr(C)]
        struct SystemInfo {
            w_processor_architecture: u16,
            w_reserved: u16,
            dw_page_size: u32,
            lp_minimum_application_address: *mut std::ffi::c_void,
            lp_maximum_application_address: *mut std::ffi::c_void,
            dw_active_processor_mask: usize,
            dw_number_of_processors: u32,
            dw_processor_type: u32,
            dw_allocation_granularity: u32,
            w_processor_level: u16,
            w_processor_revision: u16,
        }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetSystemInfo(info: *mut SystemInfo);
        }
        let mut info = MaybeUninit::<SystemInfo>::uninit();
        unsafe { GetSystemInfo(info.as_mut_ptr()) };
        let info = unsafe { info.assume_init() };
        let n = info.dw_number_of_processors.max(1);
        // Prefer last logical processor.
        let bit = (n - 1) as usize;
        Some(1usize << bit)
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// Pin `pid` to the dedicated core, raise priority, and clear that core from
/// other processes' affinity when possible. Snapshots prior affinities for restore.
pub fn apply_cpu_pin(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mask = dedicated_core_mask().ok_or_else(|| "No CPU mask".to_string())?;
        let script = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
$mask = [IntPtr]{mask}
$target = Get-Process -Id {pid} -ErrorAction Stop
$snap = @{{}}
Get-Process | ForEach-Object {{
  try {{
    $id = $_.Id
    if ($id -eq {pid}) {{ return }}
    if ($_.ProcessorAffinity -eq $null) {{ return }}
    $cur = [uint64]$_.ProcessorAffinity.ToInt64()
    if (($cur -band {mask}) -ne 0 -and ($cur -ne {mask})) {{
      $snap[$id] = $cur
      $next = $cur -band (-bnot [uint64]{mask})
      if ($next -eq 0) {{ $next = $cur }}
      $_.ProcessorAffinity = [IntPtr]$next
    }}
  }} catch {{}}
}}
$target.PriorityClass = 'High'
$target.ProcessorAffinity = $mask
# Emit snapshot as id=affinity lines
$snap.GetEnumerator() | ForEach-Object {{ "{{0}}={{1}}" -f $_.Key, $_.Value }}
"#,
            mask = mask,
            pid = pid
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .output()
            .map_err(|e| format!("CPU pin failed: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("CPU pin failed: {err}"));
        }
        let mut guard = AFFINITY_SNAPSHOT.lock().unwrap();
        guard.clear();
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let Some((id_s, aff_s)) = line.split_once('=') else {
                continue;
            };
            if let (Ok(id), Ok(aff)) = (id_s.trim().parse::<u32>(), aff_s.trim().parse::<usize>()) {
                guard.insert(id, aff);
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        Err("CPU pin is Windows-only".into())
    }
}

pub fn restore_cpu_affinities() {
    #[cfg(target_os = "windows")]
    {
        let snap = {
            let mut guard = AFFINITY_SNAPSHOT.lock().unwrap();
            std::mem::take(&mut *guard)
        };
        if snap.is_empty() {
            return;
        }
        let pairs: String = snap
            .iter()
            .map(|(id, aff)| format!("{id}={aff}"))
            .collect::<Vec<_>>()
            .join(";");
        let script = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
'{pairs}'.Split(';') | ForEach-Object {{
  if (-not $_) {{ return }}
  $parts = $_.Split('=')
  if ($parts.Length -lt 2) {{ return }}
  $id = [int]$parts[0]
  $aff = [uint64]$parts[1]
  try {{
    $p = Get-Process -Id $id -ErrorAction Stop
    $p.ProcessorAffinity = [IntPtr]$aff
  }} catch {{}}
}}
"#,
            pairs = pairs.replace('\'', "''")
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
}
