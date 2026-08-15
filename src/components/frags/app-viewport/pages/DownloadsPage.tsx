import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useDownloadStore, type DownloadItem } from "../../../../typlibs";
import { cancelNativeDownload } from "../../../../lib/nativeDownloads";
import { AppIcons } from "../../../icons";
import { Icon } from "../../../ico";
import { cn } from "../../../../lib/cn";

type DownloadFilter = "all" | "in-progress" | "completed" | "issues";

const FILTERS: { id: DownloadFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in-progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "issues", label: "Issues" },
];

function statusLabel(status: DownloadItem["status"]) {
  if (status === "active") return "Downloading";
  if (status === "queued") return "Queued";
  if (status === "paused") return "Paused";
  if (status === "done") return "Completed";
  return "Failed";
}

function statusClass(status: DownloadItem["status"]) {
  if (status === "active" || status === "done") return "text-primary-base";
  if (status === "error") return "text-state-error";
  if (status === "paused") return "text-state-warning";
  return "text-text-muted";
}

function DownloadRow({
  item,
  onCancel,
  onRemove,
}: {
  item: DownloadItem;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const inFlight =
    item.status === "active" ||
    item.status === "queued" ||
    item.status === "paused";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="cf-panel rounded-xl p-3.5"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border-subtle bg-primary-base/7 text-primary-base">
          <Icon icon={AppIcons.Package} size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-[12px] font-semibold text-text-primary">
              {item.name}
            </h3>
            <span
              className={cn(
                "shrink-0 text-[9px] font-semibold uppercase tracking-wider",
                statusClass(item.status),
              )}
            >
              {item.phase && item.phase !== item.status
                ? item.phase
                : statusLabel(item.status)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[9px] text-text-muted">
            <span>
              {item.status === "done"
                ? `${item.totalMb.toFixed(2)} MB`
                : `${item.doneMb.toFixed(2)} / ${item.totalMb.toFixed(2)} MB`}
              {item.currentFile && inFlight ? (
                <span className="text-text-disabled">
                  {" "}
                  · {item.currentFile}
                </span>
              ) : null}
            </span>
            {item.status !== "done" && (
              <span>{Math.round(item.progress)}%</span>
            )}
          </div>
          {item.error && (
            <p className="mt-1 text-[9px] text-state-error">{item.error}</p>
          )}
          {item.status !== "done" && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-overlay">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  item.status === "error"
                    ? "bg-state-error"
                    : item.status === "paused"
                      ? "bg-state-warning"
                      : "bg-primary-base",
                )}
                style={{
                  width: `${Math.max(0, Math.min(100, item.progress))}%`,
                }}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={inFlight ? onCancel : onRemove}
            aria-label={
              inFlight
                ? `Cancel ${item.name}`
                : `Remove ${item.name} from history`
            }
            className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle text-text-muted hover:border-state-error/30 hover:text-state-error cursor-pointer"
          >
            <Icon icon={AppIcons.Close} size={14} />
          </button>
        </div>
      </div>
    </motion.article>
  );
}

export default function DownloadsPage() {
  const queue = useDownloadStore((state) => state.queue);
  const remove = useDownloadStore((state) => state.remove);
  const update = useDownloadStore((state) => state.update);
  const clearCompleted = useDownloadStore((state) => state.clearCompleted);
  const [filter, setFilter] = useState<DownloadFilter>("all");

  const cancelJob = async (item: DownloadItem) => {
    const jobId = item.jobId ?? item.id;
    try {
      await cancelNativeDownload(jobId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    }
    update(item.id, {
      status: "error",
      phase: "cancelled",
      error: "Cancelled",
    });
  };

  const inProgress = useMemo(
    () =>
      queue.filter((item) =>
        ["active", "queued", "paused"].includes(item.status),
      ),
    [queue],
  );
  const completed = useMemo(
    () => queue.filter((item) => item.status === "done"),
    [queue],
  );
  const failed = useMemo(
    () => queue.filter((item) => item.status === "error"),
    [queue],
  );

  const aggregate = useMemo(() => {
    // Prefer live in-progress totals; if idle, show completed session totals.
    const source = inProgress.length > 0 ? inProgress : completed;
    const totalBytes = source.reduce(
      (sum, item) => sum + (item.totalBytes ?? item.totalMb * 1024 * 1024),
      0,
    );
    const doneBytes = source.reduce((sum, item) => {
      if (item.status === "done") {
        return sum + (item.totalBytes ?? item.totalMb * 1024 * 1024);
      }
      return sum + (item.downloadedBytes ?? item.doneMb * 1024 * 1024);
    }, 0);
    const totalMb =
      Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
    const doneMb = Math.round((doneBytes / (1024 * 1024)) * 100) / 100;
    return {
      totalMb,
      doneMb,
      progress:
        totalBytes > 0
          ? Math.min(100, Math.round((doneBytes / totalBytes) * 100))
          : inProgress.length === 0 && completed.length > 0
            ? 100
            : 0,
    };
  }, [inProgress, completed]);

  const visible = queue.filter((item) => {
    if (filter === "in-progress") {
      return ["active", "queued", "paused"].includes(item.status);
    }
    if (filter === "completed") return item.status === "done";
    if (filter === "issues") return item.status === "error";
    return true;
  });

  const filterCount = (id: DownloadFilter) => {
    if (id === "in-progress") return inProgress.length;
    if (id === "completed") return completed.length;
    if (id === "issues") return failed.length;
    return queue.length;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto scroll-hidden p-4 pb-24">
      <header className="cf-panel relative overflow-hidden rounded-xl p-4">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-primary-base/8 via-transparent to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-base">
              Transfer center
            </span>
            <h2 className="mt-1 font-sora text-[20px] font-bold text-text-primary">
              Downloads
            </h2>
            <p className="mt-1 max-w-xl text-[10px] leading-relaxed text-text-muted">
              Track Store installs for this session. Completed and failed jobs
              stay here until you clear them.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Active", inProgress.length],
              ["Complete", completed.length],
              ["Issues", failed.length],
            ].map(([label, value]) => (
              <div
                key={label}
                className="min-w-20 rounded-lg border border-border-subtle bg-black/15 px-3 py-2 text-center"
              >
                <div className="text-[14px] font-bold text-text-primary">
                  {value}
                </div>
                <div className="text-[8px] uppercase tracking-wider text-text-disabled">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {inProgress.length > 0 && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[9px] text-text-muted">
              <span>
                {aggregate.doneMb.toFixed(2)} / {aggregate.totalMb.toFixed(2)} MB
              </span>
              <span>{Math.round(aggregate.progress)}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-overlay">
              <div
                className="h-full rounded-full bg-linear-to-r from-primary-muted to-primary-base transition-[width] duration-300"
                style={{ width: `${aggregate.progress}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <nav
        aria-label="Download filters"
        className="flex items-center gap-1 border-b border-border-subtle"
      >
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              "border-b-2 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider cursor-pointer",
              filter === item.id
                ? "border-primary-base text-primary-base"
                : "border-transparent text-text-muted hover:text-text-secondary",
            )}
          >
            {item.label}
            {filterCount(item.id) > 0 ? (
              <span className="ml-1.5 text-text-disabled">
                {filterCount(item.id)}
              </span>
            ) : null}
          </button>
        ))}
        {completed.length > 0 && (
          <button
            type="button"
            onClick={() => clearCompleted()}
            className="ml-auto px-2 py-2 text-[9px] text-text-muted hover:text-text-primary cursor-pointer"
          >
            Clear completed
          </button>
        )}
      </nav>

      <section className="flex flex-col gap-2">
        {visible.map((item) => (
          <DownloadRow
            key={item.id}
            item={item}
            onCancel={() => void cancelJob(item)}
            onRemove={() => remove(item.id)}
          />
        ))}
        {!visible.length && (
          <div className="cf-panel rounded-xl p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-border-subtle bg-bg-overlay text-text-muted">
              <Icon icon={AppIcons.Download} size={20} />
            </div>
            <h3 className="mt-3 text-[12px] font-semibold text-text-primary">
              Nothing here yet
            </h3>
            <p className="mt-1 text-[10px] text-text-muted">
              Downloads started from the Store will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
