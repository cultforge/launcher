//! Best-effort CPU affinity + high priority for Minecraft (Windows experimental).
//!
//! Never pins the JVM to a single logical processor — that tanks modern Minecraft.
//! Prefer performance cores on hybrid CPUs; otherwise use the full active mask.

use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;

static AFFINITY_SNAPSHOT: Lazy<Mutex<HashMap<u32, usize>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Affinity mask for the game process (group 0 logical processors).
pub fn preferred_affinity_mask() -> Option<usize> {
    #[cfg(target_os = "windows")]
    {
        performance_core_mask().or_else(active_processor_mask)
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

#[cfg(target_os = "windows")]
fn active_processor_mask() -> Option<usize> {
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
    let mask = info.dw_active_processor_mask;
    if mask == 0 {
        None
    } else {
        Some(mask)
    }
}

/// Build a mask of the most performant cores (lowest EfficiencyClass).
/// Falls back to None when the host is homogeneous or the query fails.
#[cfg(target_os = "windows")]
fn performance_core_mask() -> Option<usize> {
    use std::mem::size_of;

    const RELATION_PROCESSOR_CORE: u32 = 0;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct GroupAffinity {
        mask: usize,
        group: u16,
        reserved: [u16; 3],
    }

    // PROCESSOR_RELATIONSHIP is followed by GroupCount GROUP_AFFINITY entries.
    // We only read the header + first group mask via careful pointer walks.
    #[repr(C)]
    struct ProcessorRelationshipHeader {
        flags: u8,
        efficiency_class: u8,
        reserved: [u8; 20],
        group_count: u16,
        // GroupMask[ANYSIZE_ARRAY] follows
    }

    #[repr(C)]
    struct SystemLogicalProcessorInformationExHeader {
        relationship: u32,
        size: u32,
        // union payload follows
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetLogicalProcessorInformationEx(
            relationship_type: u32,
            buffer: *mut u8,
            returned_length: *mut u32,
        ) -> i32;
    }

    unsafe {
        let mut needed: u32 = 0;
        let _ = GetLogicalProcessorInformationEx(
            RELATION_PROCESSOR_CORE,
            std::ptr::null_mut(),
            &mut needed,
        );
        if needed == 0 {
            return None;
        }
        let mut buf = vec![0u8; needed as usize];
        let ok = GetLogicalProcessorInformationEx(
            RELATION_PROCESSOR_CORE,
            buf.as_mut_ptr(),
            &mut needed,
        );
        if ok == 0 {
            return None;
        }

        let mut classes: Vec<(u8, usize)> = Vec::new();
        let mut offset = 0usize;
        let end = needed as usize;
        while offset + size_of::<SystemLogicalProcessorInformationExHeader>() <= end {
            let hdr = &*(buf.as_ptr().add(offset)
                as *const SystemLogicalProcessorInformationExHeader);
            if hdr.size == 0 {
                break;
            }
            if hdr.relationship == RELATION_PROCESSOR_CORE {
                let proc_off =
                    offset + size_of::<SystemLogicalProcessorInformationExHeader>();
                if proc_off + size_of::<ProcessorRelationshipHeader>() <= end {
                    let proc = &*(buf.as_ptr().add(proc_off)
                        as *const ProcessorRelationshipHeader);
                    let mask_off =
                        proc_off + size_of::<ProcessorRelationshipHeader>();
                    if proc.group_count > 0
                        && mask_off + size_of::<GroupAffinity>() <= end
                    {
                        let ga =
                            &*(buf.as_ptr().add(mask_off) as *const GroupAffinity);
                        // Stick to processor group 0 (typical desktop).
                        if ga.group == 0 && ga.mask != 0 {
                            classes.push((proc.efficiency_class, ga.mask));
                        }
                    }
                }
            }
            offset += hdr.size as usize;
        }

        if classes.is_empty() {
            return None;
        }

        let min_class = classes.iter().map(|(c, _)| *c).min()?;
        let max_class = classes.iter().map(|(c, _)| *c).max()?;
        // Homogeneous CPU — no P/E split to prefer.
        if min_class == max_class {
            return None;
        }

        let mut mask: usize = 0;
        for (class, bits) in classes {
            if class == min_class {
                mask |= bits;
            }
        }
        if mask == 0 {
            return None;
        }
        Some(mask)
    }
}

/// Pin `pid` to preferred cores, raise priority, and (on hybrid CPUs) nudge other
/// processes off those cores when affinity allows. Snapshots prior affinities for restore.
pub fn apply_cpu_pin(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mask = preferred_affinity_mask().ok_or_else(|| "No CPU mask".to_string())?;
        let full = active_processor_mask().unwrap_or(mask);
        // Only isolate other processes when the game mask is a proper subset
        // (hybrid P-cores). Stripping bits when mask == all cores is a no-op.
        let isolate = mask != full && mask != 0;

        let script = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
$mask = [IntPtr]{mask}
$isolate = ${isolate}
$target = Get-Process -Id {pid} -ErrorAction Stop
$snap = @{{}}
if ($isolate) {{
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
}}
$target.PriorityClass = 'High'
$target.ProcessorAffinity = $mask
$snap.GetEnumerator() | ForEach-Object {{ "{{0}}={{1}}" -f $_.Key, $_.Value }}
"#,
            mask = mask,
            pid = pid,
            isolate = if isolate { "$true" } else { "$false" }
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
        eprintln!(
            "CultForge CPU pin: mask=0x{mask:x} isolate={isolate} restored_later={}",
            guard.len()
        );
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
