pub mod fetch;
pub mod guild_sync;
pub mod install;
pub mod plan;
pub mod verify;

use once_cell::sync::Lazy;
use plan::{
    DownloadJobSnapshot, DownloadProgressEvent, GuildManifestSyncFile, GuildManifestSyncPlan,
    GuildSyncCheckResult, ModrinthInstallPlan,
};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

struct JobHandle {
    cancel_tx: watch::Sender<bool>,
    phase: String,
    item_count: usize,
}

static JOBS: Lazy<Mutex<HashMap<String, JobHandle>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn emit_progress(app: &AppHandle, event: DownloadProgressEvent) {
    let _ = app.emit("download-progress", event);
}

fn set_job_phase(job_id: &str, phase: &str) {
    if let Ok(mut jobs) = JOBS.lock() {
        if let Some(job) = jobs.get_mut(job_id) {
            job.phase = phase.to_string();
        }
    }
}

fn remove_job(job_id: &str) {
    if let Ok(mut jobs) = JOBS.lock() {
        jobs.remove(job_id);
    }
}

async fn run_install_job(app: AppHandle, plan: ModrinthInstallPlan) {
    let job_id = plan.job_id.clone();
    let cancel_rx = {
        let jobs = JOBS.lock().unwrap();
        jobs.get(&job_id)
            .map(|job| job.cancel_tx.subscribe())
            .expect("job missing cancel channel")
    };

    let client = match reqwest::Client::builder()
        .user_agent("CultForge/2.4.0 (launcher)")
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            emit_progress(
                &app,
                DownloadProgressEvent {
                    job_id: job_id.clone(),
                    item_id: "job".into(),
                    name: "Install".into(),
                    phase: "error".into(),
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    error: Some(format!("Failed to create HTTP client: {err}")),
                },
            );
            remove_job(&job_id);
            return;
        }
    };

    for item in &plan.items {
        if *cancel_rx.borrow() {
            emit_progress(
                &app,
                DownloadProgressEvent {
                    job_id: job_id.clone(),
                    item_id: item.version_id.clone(),
                    name: item.name.clone(),
                    phase: "cancelled".into(),
                    downloaded_bytes: 0,
                    total_bytes: item.size_bytes,
                    error: None,
                },
            );
            set_job_phase(&job_id, "cancelled");
            remove_job(&job_id);
            return;
        }

        emit_progress(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: item.version_id.clone(),
                name: item.name.clone(),
                phase: "downloading".into(),
                downloaded_bytes: 0,
                total_bytes: item.size_bytes.max(1),
                error: None,
            },
        );
        set_job_phase(&job_id, "downloading");

        let app_progress = app.clone();
        let job_progress = job_id.clone();
        let item_id = item.version_id.clone();
        let item_name = item.name.clone();
        let download_result = fetch::download_to_cache(
            &client,
            &item.url,
            &plan.cache_root,
            &item.sha512,
            &item.filename,
            item.size_bytes,
            |downloaded, total| {
                emit_progress(
                    &app_progress,
                    DownloadProgressEvent {
                        job_id: job_progress.clone(),
                        item_id: item_id.clone(),
                        name: item_name.clone(),
                        phase: "downloading".into(),
                        downloaded_bytes: downloaded,
                        total_bytes: total,
                        error: None,
                    },
                );
            },
            &cancel_rx,
            None,
        )
        .await;

        let cached = match download_result {
            Ok(path) => path,
            Err(err) if err == "cancelled" => {
                emit_progress(
                    &app,
                    DownloadProgressEvent {
                        job_id: job_id.clone(),
                        item_id: item.version_id.clone(),
                        name: item.name.clone(),
                        phase: "cancelled".into(),
                        downloaded_bytes: 0,
                        total_bytes: item.size_bytes,
                        error: None,
                    },
                );
                set_job_phase(&job_id, "cancelled");
                remove_job(&job_id);
                return;
            }
            Err(err) => {
                emit_progress(
                    &app,
                    DownloadProgressEvent {
                        job_id: job_id.clone(),
                        item_id: item.version_id.clone(),
                        name: item.name.clone(),
                        phase: "error".into(),
                        downloaded_bytes: 0,
                        total_bytes: item.size_bytes,
                        error: Some(err),
                    },
                );
                set_job_phase(&job_id, "error");
                remove_job(&job_id);
                return;
            }
        };

        emit_progress(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: item.version_id.clone(),
                name: item.name.clone(),
                phase: "verifying".into(),
                downloaded_bytes: item.size_bytes,
                total_bytes: item.size_bytes.max(1),
                error: None,
            },
        );
        set_job_phase(&job_id, "verifying");

        match verify::sha512_file(&cached).await {
            Ok(actual) => {
                if let Err(err) = verify::assert_sha512(&actual, &item.sha512) {
                    let _ = tokio::fs::remove_file(&cached).await;
                    emit_progress(
                        &app,
                        DownloadProgressEvent {
                            job_id: job_id.clone(),
                            item_id: item.version_id.clone(),
                            name: item.name.clone(),
                            phase: "error".into(),
                            downloaded_bytes: 0,
                            total_bytes: item.size_bytes,
                            error: Some(err),
                        },
                    );
                    set_job_phase(&job_id, "error");
                    remove_job(&job_id);
                    return;
                }
            }
            Err(err) => {
                emit_progress(
                    &app,
                    DownloadProgressEvent {
                        job_id: job_id.clone(),
                        item_id: item.version_id.clone(),
                        name: item.name.clone(),
                        phase: "error".into(),
                        downloaded_bytes: 0,
                        total_bytes: item.size_bytes,
                        error: Some(err),
                    },
                );
                set_job_phase(&job_id, "error");
                remove_job(&job_id);
                return;
            }
        }

        emit_progress(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: item.version_id.clone(),
                name: item.name.clone(),
                phase: "installing".into(),
                downloaded_bytes: item.size_bytes,
                total_bytes: item.size_bytes.max(1),
                error: None,
            },
        );
        set_job_phase(&job_id, "installing");

        if let Err(err) = install::install_cached_file(
            &cached,
            &plan.build_location,
            &item.dest_kind,
            &item.filename,
        )
        .await
        {
            emit_progress(
                &app,
                DownloadProgressEvent {
                    job_id: job_id.clone(),
                    item_id: item.version_id.clone(),
                    name: item.name.clone(),
                    phase: "error".into(),
                    downloaded_bytes: item.size_bytes,
                    total_bytes: item.size_bytes.max(1),
                    error: Some(err),
                },
            );
            set_job_phase(&job_id, "error");
            remove_job(&job_id);
            return;
        }

        emit_progress(
            &app,
            DownloadProgressEvent {
                job_id: job_id.clone(),
                item_id: item.version_id.clone(),
                name: item.name.clone(),
                phase: "done".into(),
                downloaded_bytes: item.size_bytes,
                total_bytes: item.size_bytes.max(1),
                error: None,
            },
        );
    }

    let total_bytes: u64 = plan.items.iter().map(|item| item.size_bytes).sum();
    emit_progress(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: "job".into(),
            name: plan
                .items
                .first()
                .map(|item| item.name.clone())
                .unwrap_or_else(|| "Modrinth install".into()),
            phase: "done".into(),
            downloaded_bytes: total_bytes,
            total_bytes: total_bytes.max(1),
            error: None,
        },
    );

    set_job_phase(&job_id, "done");
    remove_job(&job_id);
}

#[tauri::command]
pub async fn start_modrinth_install(
    app: AppHandle,
    plan: ModrinthInstallPlan,
) -> Result<String, String> {
    if plan.items.is_empty() {
        return Err("Install plan has no files".into());
    }
    if plan.build_location.trim().is_empty() {
        return Err("Build location is required".into());
    }
    if plan.cache_root.trim().is_empty() {
        return Err("Cache root is required".into());
    }

    let job_id = if plan.job_id.trim().is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        plan.job_id.clone()
    };

    {
        let mut jobs = JOBS.lock().map_err(|_| "Job registry poisoned".to_string())?;
        if jobs.contains_key(&job_id) {
            return Err(format!("Job {job_id} already running"));
        }
        let (cancel_tx, _) = watch::channel(false);
        jobs.insert(
            job_id.clone(),
            JobHandle {
                cancel_tx,
                phase: "queued".into(),
                item_count: plan.items.len(),
            },
        );
    }

    let mut plan = plan;
    plan.job_id = job_id.clone();

    emit_progress(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: "job".into(),
            name: plan
                .items
                .first()
                .map(|item| item.name.clone())
                .unwrap_or_else(|| "Modrinth install".into()),
            phase: "queued".into(),
            downloaded_bytes: 0,
            total_bytes: plan.items.iter().map(|item| item.size_bytes).sum(),
            error: None,
        },
    );

    tauri::async_runtime::spawn(run_install_job(app, plan));
    Ok(job_id)
}

#[tauri::command]
pub async fn start_guild_manifest_sync(
    app: AppHandle,
    plan: GuildManifestSyncPlan,
) -> Result<String, String> {
    if plan.build_location.trim().is_empty() {
        return Err("Build location is required".into());
    }
    if plan.cache_root.trim().is_empty() {
        return Err("Cache root is required".into());
    }
    if plan.instance_id.trim().is_empty() {
        return Err("Instance id is required".into());
    }

    // Ensure instance dirs exist for the loader profile.
    let _ = crate::instances::ensure_instance_dir(&plan.instance_id, &plan.loader)?;

    let job_id = if plan.job_id.trim().is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        plan.job_id.clone()
    };

    let item_count = plan
        .files
        .iter()
        .filter(|f| {
            let e = f.environment.trim().to_ascii_lowercase();
            e.is_empty() || e == "client" || e == "both"
        })
        .count();

    {
        let mut jobs = JOBS.lock().map_err(|_| "Job registry poisoned".to_string())?;
        if jobs.contains_key(&job_id) {
            return Err(format!("Job {job_id} already running"));
        }
        let (cancel_tx, _) = watch::channel(false);
        jobs.insert(
            job_id.clone(),
            JobHandle {
                cancel_tx,
                phase: "queued".into(),
                item_count,
            },
        );
    }

    let mut plan = plan;
    plan.job_id = job_id.clone();

    emit_progress(
        &app,
        DownloadProgressEvent {
            job_id: job_id.clone(),
            item_id: "job".into(),
            name: plan.name.clone(),
            phase: "queued".into(),
            downloaded_bytes: 0,
            total_bytes: plan.files.iter().map(|f| f.size_bytes).sum(),
            error: None,
        },
    );

    let job_id_for_spawn = job_id.clone();
    tauri::async_runtime::spawn(async move {
        let cancel_rx = {
            let jobs = JOBS.lock().unwrap();
            jobs.get(&job_id_for_spawn)
                .map(|job| job.cancel_tx.subscribe())
                .expect("job missing cancel channel")
        };
        let job_key = job_id_for_spawn.clone();
        guild_sync::run_guild_sync_job(app, plan, cancel_rx, move |phase| {
            set_job_phase(&job_key, phase);
        })
        .await;
        remove_job(&job_id_for_spawn);
    });

    Ok(job_id)
}

#[tauri::command]
pub async fn check_guild_manifest_sync(
    build_location: String,
    files: Vec<GuildManifestSyncFile>,
    excludes: Vec<String>,
    sync_mode: Option<String>,
) -> Result<GuildSyncCheckResult, String> {
    let mode = sync_mode.unwrap_or_else(|| "full".into());
    guild_sync::check_sync(&build_location, &files, &excludes, &mode).await
}

#[tauri::command]
pub async fn mark_guild_instance_synced(plan: GuildManifestSyncPlan) -> Result<(), String> {
    guild_sync::persist_managed_meta(&plan, "synced").await
}

#[tauri::command]
pub fn list_managed_instances() -> Result<Vec<guild_sync::ManagedInstanceMeta>, String> {
    guild_sync::list_managed_instances()
}

#[tauri::command]
pub fn cancel_download(job_id: String) -> Result<(), String> {
    let jobs = JOBS.lock().map_err(|_| "Job registry poisoned".to_string())?;
    let job = jobs
        .get(&job_id)
        .ok_or_else(|| format!("Unknown job {job_id}"))?;
    let _ = job.cancel_tx.send(true);
    Ok(())
}

#[tauri::command]
pub fn list_download_jobs() -> Result<Vec<DownloadJobSnapshot>, String> {
    let jobs = JOBS.lock().map_err(|_| "Job registry poisoned".to_string())?;
    Ok(jobs
        .iter()
        .map(|(job_id, handle)| DownloadJobSnapshot {
            job_id: job_id.clone(),
            phase: handle.phase.clone(),
            item_count: handle.item_count,
        })
        .collect())
}
