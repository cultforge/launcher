//! Windows helpers: hidden spawns + process-tree teardown.
//! Nuitka onefile `client.exe` leaves grandchild workers; `Child::kill` alone is not enough.

use std::path::Path;
use std::process::{Child, Command, Stdio};

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Apply no-console creation flags on Windows.
/// `CREATE_NO_WINDOW` suppresses conhost for CUI helpers and for packed
/// stubs that spawn a short-lived console child (the ~700ms Builds flash).
pub fn apply_no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
        // Extra insurance: never inherit a visible console from the parent.
        cmd.env("TERM", "dumb");
    }
    let _ = cmd;
}

/// Kill a child and its entire process tree (Windows: taskkill /T).
/// Does not wait on taskkill forever — UI close must stay snappy.
pub fn kill_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        let pid = child.id();
        let mut kill = Command::new("taskkill");
        kill.args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        apply_no_window(&mut kill);
        let _ = kill.spawn();
    }
    let _ = child.kill();
    // Brief wait only — don't block quit for hung grandchildren.
    let _ = child.try_wait();
}

/// Force-kill leftover helper images by name (best-effort, no window).
pub fn kill_image(image: &str) {
    #[cfg(windows)]
    {
        let mut kill = Command::new("taskkill");
        kill.args(["/IM", image, "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        apply_no_window(&mut kill);
        let _ = kill.spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = image;
    }
}

/// Prefer `dir/name`, then `dir/resources/name`.
#[allow(dead_code)]
pub fn find_next_to_exe(exe_dir: &Path, name: &str) -> Option<std::path::PathBuf> {
    let direct = exe_dir.join(name);
    if direct.is_file() {
        return Some(direct);
    }
    let nested = exe_dir.join("resources").join(name);
    if nested.is_file() {
        return Some(nested);
    }
    None
}
