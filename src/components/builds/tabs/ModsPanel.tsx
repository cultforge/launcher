import { useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { toast } from "sonner";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import {
  filterContent,
  modItemFrom,
  type ContentFilter,
  type ModItem,
} from "../../../data/buildContent";
import { useBuildStore } from "../../../stores/build";
import { useLibraryContentStore } from "../../../stores/libraryContent";
import { ContentListShell, EnableToggle } from "./ContentListShell";
import { ManagedBuildBanner } from "./ManagedBuildBanner";
import {
  importInstanceFiles,
  openInstanceSubdir,
  pickContentFiles,
} from "../../../lib/buildMeta";
import { ImportUrlModal } from "../../modals/ImportUrlModal";
import {
  importContentFromUrl,
  isImportCancelled,
} from "../../../lib/contentImport";

const FILTERS: ContentFilter[] = ["All", "Enabled", "Disabled", "Updates"];

function ModRow({
  item,
  busy,
  locked,
  onToggle,
}: {
  item: ModItem;
  busy: boolean;
  locked: boolean;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-elevated transition-colors">
      {item.image ? (
        <img
          src={item.image}
          alt=""
          className="h-9 w-9 rounded-lg shrink-0 border border-border-subtle object-cover"
        />
      ) : (
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border border-border-subtle bg-white/4 text-text-secondary">
          <Icon icon={AppIcons.Mods} size={15} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-text-primary font-medium truncate">
            {item.name}
          </span>
          {item.updateAvailable && (
            <Chip size="sm" variant="soft" color="success">
              <Chip.Label className="text-[9px] text-primary-base">
                Update
              </Chip.Label>
            </Chip>
          )}
        </div>
        <div className="text-[10px] text-text-muted truncate">
          {item.author} · {item.version} · {item.size}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!locked && item.updateAvailable && (
          <button
            type="button"
            className="px-2.5 py-1 text-[10px] font-semibold rounded-md border border-primary-base/30 text-primary-base hover:bg-primary-base/10 cursor-pointer"
          >
            Update
          </button>
        )}
        {!locked && (
          <button
            type="button"
            className="px-2.5 py-1 text-[10px] font-semibold rounded-md border border-white/10 text-text-muted hover:text-text-primary cursor-pointer"
          >
            Remove
          </button>
        )}
        {locked ? (
          <span className="text-[10px] text-text-disabled px-2">
            {item.enabled ? "On" : "Off"}
          </span>
        ) : (
          <EnableToggle
            enabled={item.enabled}
            onChange={(next) => onToggle(item.id, next)}
            label={busy ? "Updating…" : item.enabled ? "Disable" : "Enable"}
          />
        )}
      </div>
    </div>
  );
}

export function ModsPanel() {
  const managed = useBuildStore((s) => s.active().managed);
  const buildId = useBuildStore((s) => s.activeId);
  const location = useBuildStore((s) => s.active().location);
  const libraryItems = useLibraryContentStore((s) => s.items);
  const scanning = useLibraryContentStore((s) => s.scanning);
  const setModEnabled = useLibraryContentStore((s) => s.setModEnabled);
  const scan = useLibraryContentStore((s) => s.scan);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContentFilter>("All");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);

  const items = useMemo<ModItem[]>(
    () =>
      libraryItems
        .filter((item) => item.kind === "mod")
        .map(modItemFrom),
    [libraryItems],
  );

  const filtered = filterContent(items, filter, search);

  const onToggle = async (id: string, enabled: boolean) => {
    setBusyId(id);
    try {
      await setModEnabled(id, enabled);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not update mod. Close Minecraft and try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const onOpenFolder = () => {
    void openInstanceSubdir(buildId, "mods").catch((err) => {
      toast.error(err instanceof Error ? err.message : "Could not open folder");
    });
  };

  const onAddMod = async () => {
    try {
      const paths = await pickContentFiles("mods");
      if (!paths.length) return;
      const result = await importInstanceFiles(buildId, "mods", paths);
      if (result.reroutes.length) {
        toast.message(`Routed “${result.reroutes[0].name}” to ${result.reroutes[0].toKind}`);
      }
      if (location) await scan(location);
      const n = result.imported;
      toast.success(n ? `Added ${n} mod${n === 1 ? "" : "s"}` : "No files imported");
    } catch (err) {
      if (!isImportCancelled(err)) {
        toast.error(err instanceof Error ? err.message : "Could not add mod");
      }
    }
  };

  return (
    <>
      <ContentListShell
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search mods…"
        filters={FILTERS}
        filter={filter}
        onFilterChange={setFilter}
        secondaryAction={
          managed
            ? undefined
            : {
                label: "Import URL",
                onClick: () => setUrlOpen(true),
              }
        }
        primaryAction={
          managed
            ? undefined
            : {
                label: "Add mod",
                onClick: () => void onAddMod(),
              }
        }
        note={
          managed ? (
            <ManagedBuildBanner />
          ) : (
            <p className="text-[11px] text-text-muted px-0.5">
              <button
                type="button"
                onClick={onOpenFolder}
                className="underline underline-offset-2 hover:text-text-secondary cursor-pointer"
              >
                Open mods folder
              </button>
            </p>
          )
        }
        empty={filtered.length === 0}
        emptyLabel={scanning ? "Scanning mods…" : "No mods found in this build"}
      >
        {filtered.map((m) => (
          <ModRow
            key={m.id}
            item={m}
            busy={busyId === m.id}
            locked={managed}
            onToggle={onToggle}
          />
        ))}
      </ContentListShell>
      <ImportUrlModal
        open={urlOpen}
        title="Import mod from URL"
        onClose={() => setUrlOpen(false)}
        onSubmit={async (url) => {
          await importContentFromUrl("mods", url);
          toast.success("Mod imported");
        }}
      />
    </>
  );
}
