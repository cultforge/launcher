// typlibs.tsx - shared types + stores
import type { ElementType } from "react";
import { create } from "zustand";

interface IconProps {
  icon: ElementType | string;
  size?: number | string;
  width?: number | string;
  height?: number | string;
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}

export type PrimaryTab =
  | "Home"
  | "Builds"
  | "Guilds"
  | "Mods"
  | "Servers"
  | "Store"
  | "Admin";

type NavigationStore = {
  primaryTab: PrimaryTab;
  sideItem: string;
  setPrimaryTab: (tab: PrimaryTab) => void;
  setSideItem: (item: string) => void;
};

export const useNavigationStore = create<NavigationStore>((set) => ({
  primaryTab: "Home",
  sideItem: "Home",
  setPrimaryTab: (tab) => set({ primaryTab: tab }),
  setSideItem: (item) => set({ sideItem: item }),
}));

export type DownloadItem = {
  id: string;
  name: string;
  progress: number;
  totalMb: number;
  doneMb: number;
  status: "queued" | "active" | "paused" | "done" | "error";
  jobId?: string;
  phase?: string;
  error?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  /** Per-file byte progress within a multi-file job. */
  fileProgress?: Record<
    string,
    { downloaded: number; total: number; finished: boolean }
  >;
  currentFile?: string;
};

type DownloadStore = {
  queue: DownloadItem[];
  enqueue: (
    item: Omit<DownloadItem, "progress" | "doneMb" | "status"> &
      Partial<Pick<DownloadItem, "progress" | "doneMb" | "status">>,
  ) => void;
  update: (id: string, patch: Partial<DownloadItem>) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  applyNativeProgress: (event: {
    jobId: string;
    itemId: string;
    name: string;
    phase: string;
    downloadedBytes: number;
    totalBytes: number;
    error?: string | null;
  }) => void;
};

function bytesToMb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function statusFromPhase(phase: string): DownloadItem["status"] {
  if (phase === "queued") return "queued";
  if (phase === "done") return "done";
  if (phase === "error" || phase === "cancelled") return "error";
  return "active";
}

function jobPhaseLabel(phase: string, itemId: string): string {
  if (phase === "done" && itemId !== "job") return "installing";
  return phase;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  queue: [],
  enqueue: (item) =>
    set((s) => ({
      queue: [
        ...s.queue.filter((entry) => entry.id !== item.id),
        {
          progress: 0,
          doneMb: 0,
          status: "queued",
          fileProgress: {},
          ...item,
        },
      ],
    })),
  update: (id, patch) =>
    set((s) => ({
      queue: s.queue.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    })),
  remove: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
  clearCompleted: () =>
    set((s) => ({
      queue: s.queue.filter((item) => item.status !== "done"),
    })),
  applyNativeProgress: (event) => {
    const existing = get().queue.find((item) => item.id === event.jobId);
    const isJobComplete = event.phase === "done" && event.itemId === "job";
    const isTerminalError =
      event.phase === "error" || event.phase === "cancelled";

    const fileProgress: NonNullable<DownloadItem["fileProgress"]> = {
      ...(existing?.fileProgress ?? {}),
    };

    if (event.itemId !== "job") {
      const finished =
        event.phase === "done" ||
        event.phase === "verifying" ||
        event.phase === "installing" ||
        isTerminalError;
      const total = Math.max(event.totalBytes, 1);
      const downloaded = finished
        ? total
        : Math.min(event.downloadedBytes, total);
      fileProgress[event.itemId] = {
        downloaded,
        total,
        finished:
          event.phase === "done" ||
          (finished && !isTerminalError && event.phase !== "error"),
      };
      if (isTerminalError) {
        fileProgress[event.itemId] = {
          downloaded: event.downloadedBytes,
          total,
          finished: false,
        };
      }
    }

    const filesDownloaded = Object.values(fileProgress).reduce(
      (sum, file) => sum + file.downloaded,
      0,
    );
    const filesKnownTotal = Object.values(fileProgress).reduce(
      (sum, file) => sum + file.total,
      0,
    );

    // Prefer the plan total from enqueue; never shrink when a single file reports.
    const totalBytes = Math.max(
      existing?.totalBytes ?? 0,
      isJobComplete ? event.totalBytes : 0,
      filesKnownTotal,
      1,
    );

    const downloadedBytes = isJobComplete
      ? totalBytes
      : isTerminalError
        ? Math.min(filesDownloaded, totalBytes)
        : Math.min(filesDownloaded, totalBytes);

    const progress = isJobComplete
      ? 100
      : Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));

    const displayPhase = isJobComplete
      ? "done"
      : isTerminalError
        ? event.phase
        : jobPhaseLabel(event.phase, event.itemId);

    const patch: DownloadItem = {
      id: event.jobId,
      jobId: event.jobId,
      // Keep the Store/job title; only fall back to event name for unknown jobs.
      name: existing?.name || event.name || "Download",
      phase: displayPhase,
      status: statusFromPhase(
        isJobComplete
          ? "done"
          : event.phase === "done" && event.itemId !== "job"
            ? "installing"
            : event.phase,
      ),
      downloadedBytes,
      totalBytes,
      doneMb: bytesToMb(downloadedBytes),
      totalMb: bytesToMb(totalBytes),
      progress,
      fileProgress,
      currentFile:
        event.itemId !== "job" ? event.name : existing?.currentFile,
      error: event.error ?? undefined,
    };

    if (isTerminalError) {
      patch.status = "error";
      patch.phase = event.phase;
      if (event.phase === "cancelled") {
        patch.error = patch.error || "Cancelled";
      }
    }
    if (isJobComplete) {
      patch.status = "done";
      patch.progress = 100;
      patch.phase = "done";
      patch.currentFile = undefined;
    }

    if (existing) {
      get().update(event.jobId, patch);
    } else {
      get().enqueue(patch);
    }
  },
}));


export const Icon = ({
  icon: IconComponent,
  size = 20,
  width,
  height,
  className,
  weight,
}: IconProps) => {
  if (IconComponent == null) return null;

  const finalWidth = width ?? size;
  const finalHeight = height ?? size;

  if (typeof IconComponent === "string") {
    return (
      <img
        src={IconComponent}
        width={finalWidth}
        height={finalHeight}
        className={className}
        alt="Icon"
        style={{ width: finalWidth, height: finalHeight }}
      />
    );
  }

  return (
    <IconComponent
      size={size}
      width={finalWidth}
      height={finalHeight}
      className={className}
      {...(weight && { weight })}
    />
  );
};

export interface NavItem {
  label: string;
  icon: any;
  iconProps?: Omit<IconProps, "icon">;
  primaryTab?: PrimaryTab;
  badge?: string | number;
}

export interface SMenu {
  section: string;
  options: Array<NavItem>;
}

export interface NavigationBarProps {
  smenu?: SMenu[];
  collapsed: boolean;
  onToggle: () => void;
}

export interface PerformanceResult {
  score: number;
  beamX: string;
  beamY: string;
  rate: string;
}
