import { useCallback, useEffect, useState } from "react";
import { Chip } from "@heroui/react";
import { toast } from "sonner";
import { useBuildStore } from "../../../stores/build";
import {
  createBuildBackup,
  deleteBuildBackup,
  listBuildBackups,
  restoreBuildBackup,
  type BackupInfo,
} from "../../../lib/buildMeta";

function formatWhen(ms: number): string {
  if (!ms) return "Unknown";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function backupKind(id: string): string {
  return id.startsWith("worlds-") ? "Worlds" : "Full";
}

export function BackupsPanel() {
  const buildId = useBuildStore((s) => s.activeId);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!buildId || buildId === "none") {
      setBackups([]);
      return;
    }
    try {
      setBackups(await listBuildBackups(buildId));
    } catch {
      setBackups([]);
    }
  }, [buildId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const last = backups[0];
  const totalLabel =
    backups.length === 0
      ? "0 MB"
      : `${formatSize(backups.reduce((sum, b) => sum + b.sizeBytes, 0))}`;

  const onCreate = async () => {
    setBusy(true);
    try {
      await createBuildBackup(buildId, false);
      toast.success("Backup created");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async (backup: BackupInfo) => {
    if (
      !window.confirm(
        `Restore ${formatWhen(backup.createdMs)}? Current instance files will be replaced.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await restoreBuildBackup(buildId, backup.id);
      toast.success("Backup restored");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (backup: BackupInfo) => {
    if (!window.confirm(`Delete backup from ${formatWhen(backup.createdMs)}?`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteBuildBackup(buildId, backup.id);
      toast.message("Backup deleted");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <header className="cf-panel rounded-xl px-4 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-sora text-[15px] font-bold text-text-primary">
            Backups
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            Last {last ? formatWhen(last.createdMs) : "never"} · {totalLabel} ·
            Keep last 5
          </p>
        </div>
        <button
          type="button"
          disabled={busy || !buildId || buildId === "none"}
          onClick={() => void onCreate()}
          className="cf-btn-primary px-4 py-2 rounded-lg text-[12px] cursor-pointer shrink-0 disabled:opacity-50"
        >
          {busy ? "Creating backup…" : "Create backup now"}
        </button>
      </header>

      <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
        {backups.length === 0 ? (
          <div className="px-3 py-10 text-center text-[13px] text-text-muted">
            No backups yet
          </div>
        ) : (
          backups.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-elevated transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary font-medium">
                  {formatWhen(b.createdMs)}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {formatSize(b.sizeBytes)}
                </div>
              </div>
              <Chip size="sm" variant="soft" color="default">
                <Chip.Label className="text-[9px]">{backupKind(b.id)}</Chip.Label>
              </Chip>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRestore(b)}
                className="px-2.5 py-1 text-[10px] font-semibold rounded-md border border-primary-base/30 text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50"
              >
                Restore
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete(b)}
                className="px-2.5 py-1 text-[10px] font-semibold rounded-md border border-white/10 text-text-muted hover:text-text-primary cursor-pointer disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      <p className="text-[10px] text-text-disabled px-0.5">
        Auto-backup weekly — off
      </p>
    </div>
  );
}
