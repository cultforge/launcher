import { useMemo } from "react";
import { Chip } from "@heroui/react";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";
import {
  UPDATE_FILTERS,
  filterUpdates,
  groupUpdates,
  totalUpdateSizeLabel,
  type UpdateFilter,
  type UpdateItem,
  type UpdateKind,
} from "../../../../data/updates";
import { useUpdatesStore } from "../../../../stores/updates";
import { cn } from "../../../../lib/cn";

function kindIcon(kind: UpdateKind) {
  switch (kind) {
    case "build":
      return AppIcons.Builds;
    case "launcher":
      return AppIcons.Download;
    default:
      return AppIcons.Mods;
  }
}

function kindLabel(kind: UpdateKind | "All") {
  if (kind === "All") return "All";
  if (kind === "build") return "Builds";
  if (kind === "mod") return "Mods";
  return "Launcher";
}

function UpdateRow({ item }: { item: UpdateItem }) {
  const applyItem = useUpdatesStore((s) => s.applyItem);
  const label =
    item.status === "updating"
      ? "Updating…"
      : item.status === "done"
        ? "Done"
        : item.kind === "mod" || item.id.startsWith("launcher:")
          ? "Update"
          : "View";
  return (
    <div className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-bg-elevated transition-colors">
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border border-border-subtle bg-white/[0.04] text-text-secondary">
        <Icon icon={kindIcon(item.kind)} size={16} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-text-primary font-medium truncate">
            {item.name}
          </span>
          <Chip size="sm" variant="soft" color="default">
            <Chip.Label className="text-[9px]">{kindLabel(item.kind)}</Chip.Label>
          </Chip>
        </div>
        {item.instance && (
          <span className="text-[10px] text-text-muted truncate">
            {item.instance}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary">
          <span className="font-mono text-text-muted">
            {item.from}
            <span className="mx-1 opacity-50">→</span>
            <span className="text-primary-base">{item.to}</span>
          </span>
          <span className="opacity-30">·</span>
          <span>{item.size}</span>
        </div>
        <p className="text-[11px] text-text-muted line-clamp-1">
          {item.changelog}
        </p>
      </div>
      <button
        type="button"
        disabled={item.status === "updating" || item.status === "done"}
        onClick={() => void applyItem(item.id)}
        className="shrink-0 px-3.5 py-1.5 text-[11px] font-semibold rounded-lg border border-white/[0.1] text-text-secondary hover:text-text-primary hover:bg-white/[0.04] cursor-pointer transition-colors disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  );
}

function UpdateGroup({
  title,
  items,
}: {
  title: string;
  items: UpdateItem[];
}) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted px-1">
        {title}
        <span className="text-text-disabled ml-1.5 normal-case tracking-normal">
          {items.length}
        </span>
      </h3>
      <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
        {items.map((u) => (
          <UpdateRow key={u.id} item={u} />
        ))}
      </div>
    </section>
  );
}

function UpdatesPage() {
  const filter = useUpdatesStore((s) => s.filter);
  const setFilter = useUpdatesStore((s) => s.setFilter);
  const lastChecked = useUpdatesStore((s) => s.lastChecked);
  const items = useUpdatesStore((s) => s.items);
  const checking = useUpdatesStore((s) => s.checking);
  const check = useUpdatesStore((s) => s.check);
  const applyPendingMods = useUpdatesStore((s) => s.applyPendingMods);

  const filtered = useMemo(
    () => filterUpdates(items, filter),
    [items, filter],
  );
  const grouped = useMemo(() => groupUpdates(filtered), [filtered]);
  const totalSize = totalUpdateSizeLabel(filtered);
  const pendingCount = filtered.length;

  const onCheck = () => {
    void check(navigator.onLine);
  };

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <header className="cf-panel rounded-xl px-4 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-sora text-[17px] font-bold text-text-primary">
            Updates
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            {pendingCount} pending · {totalSize}
            <span className="mx-1.5 opacity-40">·</span>
            {checking ? "Checking…" : `Last checked ${lastChecked}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCheck}
            disabled={checking}
            className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-white/[0.1] text-text-secondary hover:text-text-primary hover:bg-white/[0.04] cursor-pointer transition-colors disabled:opacity-40"
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
          <button
            type="button"
            disabled={pendingCount === 0}
            onClick={() => void applyPendingMods()}
            className="cf-btn-primary px-4 py-2 rounded-lg text-[12px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Update all
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {UPDATE_FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f as UpdateFilter)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer transition-colors",
                active
                  ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "border-white/[0.08] text-text-muted hover:text-text-primary hover:bg-white/[0.03]",
              )}
            >
              {kindLabel(f)}
            </button>
          );
        })}
      </div>

      {pendingCount === 0 ? (
        <div className="cf-panel rounded-xl flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
          <Icon
            icon={AppIcons.Download}
            size={28}
            className="text-primary-base/60"
          />
          <div>
            <h3 className="font-sora text-[15px] font-bold text-text-primary">
              You’re up to date
            </h3>
            <p className="text-[12px] text-text-muted mt-1 max-w-sm">
              No pending updates in this filter. Check again anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onCheck}
            disabled={checking}
            className="px-4 py-2 text-[11px] font-semibold rounded-lg border border-primary-base/30 text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-40"
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
        </div>
      ) : filter === "All" ? (
        <div className="flex flex-col gap-4">
          <UpdateGroup title="Builds" items={grouped.builds} />
          <UpdateGroup title="Mods" items={grouped.mods} />
          <UpdateGroup title="Launcher" items={grouped.launcher} />
        </div>
      ) : (
        <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
          {filtered.map((u) => (
            <UpdateRow key={u.id} item={u} />
          ))}
        </div>
      )}
    </div>
  );
}

export default UpdatesPage;
