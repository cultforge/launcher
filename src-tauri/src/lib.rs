use once_cell::sync::Lazy;
use std::fs::OpenOptions;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use serde::Serialize;
use tauri::{Manager, RunEvent, WindowEvent};

mod content_cache;
mod downloads;
mod instances;
mod launch;
mod java_runtime;
mod mojang_install;
mod loader_install;
mod minecraft_options;
mod scanner;
mod build_meta;
mod backups;
mod display;
mod windows_game;
mod secrets;
mod local_assistant;
mod mping;
mod win_proc;

static PORT: Lazy<Mutex<u16>> = Lazy::new(|| {
    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind to free port");
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    Mutex::new(port)
});

/// Per-launch secret handoff to client.py; React reads via get_loopback_secret.
static LOOPBACK_SECRET: Lazy<Mutex<String>> = Lazy::new(|| {
    Mutex::new(format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4()))
});

static CLIENT_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_port() -> u16 {
    *PORT.lock().unwrap()
}

#[tauri::command]
fn get_loopback_secret() -> String {
    LOOPBACK_SECRET.lock().unwrap().clone()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarInfo {
    port: u16,
    loopback_secret: String,
}

#[tauri::command]
fn get_sidecar_info() -> SidecarInfo {
    SidecarInfo {
        port: *PORT.lock().unwrap(),
        loopback_secret: LOOPBACK_SECRET.lock().unwrap().clone(),
    }
}

const SIDECAR_EXE_NAME: &str = "client.exe";
/// Legacy freeze name — still accepted if present next to the app.
const SIDECAR_EXE_LEGACY: &str = "cultforge-sidecar.exe";
#[cfg(not(windows))]
const SIDECAR_UNIX_NAME: &str = "client";
const CLIENT_PY_NAME: &str = "client.py";

fn look_for_sidecar_named(name: &str) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("CULTFORGE_CLIENT_PY") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }

    // Installed / running binary layout first (never prefer compile-time workspace paths).
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..4 {
            if let Some(ref d) = dir {
                for candidate in [
                    d.join(name),
                    d.join("resources").join(name),
                ] {
                    if candidate.exists() {
                        if let Ok(canonical) = candidate.canonicalize() {
                            return Some(canonical);
                        }
                        return Some(candidate);
                    }
                }
                dir = d.parent().map(|p| p.to_path_buf());
            }
        }
    }

    // Dev / freeze paths (CARGO_MANIFEST_DIR only exists meaningfully on build machines).
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(name);
    if let Ok(canonical) = workspace.canonicalize() {
        return Some(canonical);
    }
    if workspace.exists() {
        return Some(workspace);
    }

    let check_dist = name == SIDECAR_EXE_NAME
        || name == SIDECAR_EXE_LEGACY
        || name == CLIENT_PY_NAME
        || name == "client";
    if check_dist {
        let dist = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("dist-sidecar")
            .join(name);
        if let Ok(canonical) = dist.canonicalize() {
            return Some(canonical);
        }
        if dist.exists() {
            return Some(dist);
        }
        let res = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(name);
        if let Ok(canonical) = res.canonicalize() {
            return Some(canonical);
        }
        if res.exists() {
            return Some(res);
        }
    }

    None
}

/// Prefer frozen sidecar. Windows release requires `client.exe`.
/// Linux/macOS may use a native `client` binary, or `client.py` when present.
fn resolve_sidecar() -> Result<(PathBuf, bool), String> {
    if let Some(exe) = look_for_sidecar_named(SIDECAR_EXE_NAME) {
        return Ok((exe, true));
    }
    if let Some(exe) = look_for_sidecar_named(SIDECAR_EXE_LEGACY) {
        return Ok((exe, true));
    }
    #[cfg(not(windows))]
    {
        if let Some(bin) = look_for_sidecar_named(SIDECAR_UNIX_NAME) {
            return Ok((bin, true));
        }
        if let Some(py) = look_for_sidecar_named(CLIENT_PY_NAME) {
            return Ok((py, false));
        }
    }
    #[cfg(all(windows, debug_assertions))]
    {
        if let Some(py) = look_for_sidecar_named(CLIENT_PY_NAME) {
            return Ok((py, false));
        }
    }
    #[cfg(windows)]
    {
        Err(format!(
            "{SIDECAR_EXE_NAME} not found next to CultForge / resources. Run `npm run sidecar:freeze` (Windows release never uses client.py)."
        ))
    }
    #[cfg(not(windows))]
    {
        Err(format!(
            "{SIDECAR_UNIX_NAME} / {CLIENT_PY_NAME} not found next to CultForge. Place a frozen client binary or client.py beside the app."
        ))
    }
}

fn find_python() -> Option<&'static str> {
    for candidate in ["py", "python", "python3"] {
        let ok = Command::new(candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            return Some(candidate);
        }
    }
    None
}

fn client_log_path(workdir: &std::path::Path) -> PathBuf {
    workdir.join("client.sidecar.log")
}

fn spawn_client(port: u16) -> Result<(), String> {
    let (sidecar, is_frozen) = resolve_sidecar()?;
    eprintln!(
        "[cultforge] Resolving sidecar → {} ({})",
        sidecar.display(),
        if is_frozen { "frozen exe" } else { "python script" }
    );

    let workdir = sidecar
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    let log_path = client_log_path(&workdir);
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open sidecar log {}: {e}", log_path.display()))?;
    let log_err = log_file
        .try_clone()
        .map_err(|e| format!("Failed to clone sidecar log handle: {e}"))?;

    let loopback_secret = LOOPBACK_SECRET.lock().unwrap().clone();

    let child = if is_frozen {
        eprintln!(
            "[cultforge] Spawning {} on 127.0.0.1:{port} (cwd {}, log {})",
            sidecar.display(),
            workdir.display(),
            log_path.display()
        );
        let mut cmd = Command::new(&sidecar);
        cmd.arg(port.to_string())
            .env("CULTFORGE_LOOPBACK_SECRET", loopback_secret)
            .current_dir(&workdir)
            .stdout(Stdio::from(log_file))
            .stderr(Stdio::from(log_err));
        win_proc::apply_no_window(&mut cmd);
        cmd.spawn()
            .map_err(|e| format!("Failed to spawn {SIDECAR_EXE_NAME}: {e}"))?
    } else {
        let python =
            find_python().ok_or_else(|| "No Python interpreter found (py/python)".to_string())?;
        eprintln!(
            "[cultforge] Spawning {} {} on 127.0.0.1:{port} (cwd {}, log {})",
            python,
            sidecar.display(),
            workdir.display(),
            log_path.display()
        );
        let mut cmd = Command::new(python);
        cmd.arg(&sidecar)
            .arg(port.to_string())
            .env("CULTFORGE_LOOPBACK_SECRET", loopback_secret)
            .current_dir(&workdir)
            .stdout(Stdio::from(log_file))
            .stderr(Stdio::from(log_err));
        win_proc::apply_no_window(&mut cmd);
        cmd.spawn()
            .map_err(|e| format!("Failed to spawn client.py: {e}"))?
    };

    *CLIENT_CHILD.lock().unwrap() = Some(child);
    println!(
        "Spawned sidecar on 127.0.0.1:{port} via {}",
        if is_frozen {
            SIDECAR_EXE_NAME
        } else {
            "python"
        }
    );
    Ok(())
}

fn kill_client() {
    if let Some(mut child) = CLIENT_CHILD.lock().unwrap().take() {
        win_proc::kill_tree(&mut child);
    }
    // Nuitka onefile / orphans from previous crashes
    win_proc::kill_image("client.exe");
    win_proc::kill_image("cultforge-sidecar.exe");
}

fn cleanup_helpers() {
    kill_client();
    mping::kill_mping_broker();
    scanner::kill_scanner();
    win_proc::kill_image("scanner.exe");
    win_proc::kill_image("ctfgbroker.exe");
}

/// Hide UI immediately, tear down helpers off-thread, then exit.
fn quit_app(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        let _ = launch::stop_minecraft();
        cleanup_helpers();
        // Give taskkill a beat to detach, then exit without blocking the UI.
        std::thread::sleep(std::time::Duration::from_millis(150));
        handle.exit(0);
    });
}

fn start_background_helpers(app: tauri::AppHandle, port: u16) {
    std::thread::spawn(move || {
        windows_game::register_process_as_game();
        if let Err(e) = spawn_client(port) {
            eprintln!("[cultforge] {e}");
        }
        scanner::warm_scanner(&app);
        if let Err(e) = mping::ensure_mping_broker() {
            eprintln!("[cultforge] mping broker: {e}");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = *PORT.lock().unwrap();

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            eprintln!("[cultforge] secondary instance argv={argv:?}");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_port,
            get_loopback_secret,
            get_sidecar_info,
            downloads::start_modrinth_install,
            downloads::start_guild_manifest_sync,
            downloads::check_guild_manifest_sync,
            downloads::list_managed_instances,
            downloads::cancel_download,
            downloads::list_download_jobs,
            scanner::scanner_call,
            scanner::get_minecraft_root,
            scanner::list_local_builds,
            scanner::list_local_content,
            content_cache::content_hash_file,
            content_cache::cache_get_meta,
            content_cache::cache_put_meta,
            content_cache::cache_ensure_image,
            minecraft_options::set_mod_enabled,
            minecraft_options::read_minecraft_options,
            minecraft_options::write_minecraft_options,
            minecraft_options::set_resource_pack_enabled,
            minecraft_options::set_shader_pack,
            instances::get_instances_root,
            instances::ensure_build_instance,
            instances::open_instance_folder,
            instances::open_instance_subdir,
            instances::pick_content_files,
            instances::import_instance_files,
            instances::duplicate_build_instance,
            instances::export_build_pack,
            build_meta::read_build_notes,
            build_meta::write_build_notes,
            build_meta::read_build_config,
            build_meta::write_build_config,
            build_meta::read_build_meta,
            build_meta::add_build_playtime_minutes,
            build_meta::touch_build_last_played,
            backups::list_build_backups,
            backups::create_build_backup,
            backups::restore_build_backup,
            backups::delete_build_backup,
            display::list_display_resolutions,
            launch::resolve_java,
            launch::set_java_gpu_preference,
            java_runtime::ensure_java,
            java_runtime::list_java_runtimes,
            mojang_install::list_mojang_versions,
            mojang_install::install_mojang_version,
            loader_install::list_loader_versions,
            loader_install::install_loader_build,
            launch::launch_minecraft,
            launch::get_launch_status,
            launch::stop_minecraft,
            launch::read_instance_log_tail,
            launch::list_instance_session_logs,
            launch::system_snapshot,
            launch::write_crash_report,
            launch::minimize_to_tray,
            launch::restore_from_tray,
            secrets::secret_has,
            secrets::secret_set,
            secrets::secret_clear,
            secrets::secret_status,
            local_assistant::local_assistant_chat,
            mping::get_cultforge_home,
            mping::get_mping_port,
            mping::write_mping_servers,
            mping::read_mping_servers,
            mping::ensure_mping_broker,
        ])
        .setup(move |app| {
            // Keep setup tiny: AUMID + tray only. Heavy helpers start off-thread
            // so the webview paints instead of "(Not Responding)".
            windows_game::set_app_user_model_id();
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("[cultforge] tray setup failed: {e}");
            }
            start_background_helpers(app.handle().clone(), port);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            // Decorations-false UI calls window.close(); with a tray that would
            // leave the app (and Nuitka client.exe tree) alive forever.
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" => {
                api.prevent_close();
                quit_app(&app_handle);
            }
            RunEvent::Exit => {
                // Best-effort if something else triggered exit.
                let _ = launch::stop_minecraft();
                cleanup_helpers();
            }
            _ => {}
        });
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "Show CultForge", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon")?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("CultForge")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = launch::restore_from_tray(app.clone());
            }
            "quit" => {
                quit_app(&app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = launch::restore_from_tray(app.clone());
            }
        })
        .build(app)?;

    Ok(())
}
