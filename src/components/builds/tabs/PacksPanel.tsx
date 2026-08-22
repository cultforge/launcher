import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { toast } from "sonner";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import {
  filterContent,
  packItemFrom,
  type ContentFilter,
  type PackItem,
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

const FILTERS: ContentFilter[] = ["All", "Enabled", "Disabled"];

function PackRow({
  item,
  locked,
  onToggle,
}: {
  item: PackItem;
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
          <Icon icon={AppIcons.Database} size={15} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-text-primary font-medium truncate">
            {item.name}
          </span>
          <Chip size="sm" variant="soft" color="default">
            <Chip.Label className="text-[9px]">{item.resolution}</Chip.Label>
          </Chip>
        </div>
        <div className="text-[10px] text-text-muted">{item.size}</div>
      </div>
      {locked ? (
        <span className="text-[10px] text-text-disabled px-2">
          {item.enabled ? "On" : "Off"}
        </span>
      ) : (
        <EnableToggle
          enabled={item.enabled}
          onChange={(next) => onToggle(item.id, next)}
        />
      )}
    </div>
  );
}

export function PacksPanel() {
  const managed = useBuildStore((s) => s.active().managed);
  const buildId = useBuildStore((s) => s.activeId);
  const location = useBuildStore((s) => s.active().location);
  const libraryItems = useLibraryContentStore((s) => s.items);
  const scanning = useLibraryContentStore((s) => s.scanning);
  const loadOptions = useLibraryContentStore((s) => s.loadOptions);
  const setPackEnabled = useLibraryContentStore((s) => s.setPackEnabled);
  const scan = useLibraryContentStore((s) => s.scan);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContentFilter>("All");
  const [urlOpen, setUrlOpen] = useState(false);
  const [datapackUrlOpen, setDatapackUrlOpen] = useState(false);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const items = useMemo<PackItem[]>(
    () =>
      libraryItems
        .filter((item) => item.kind === "resource-pack")
        .map(packItemFrom),
    [libraryItems],
  );

  const filtered = filterContent(items, filter, search);

  const onToggle = async (id: string, enabled: boolean) => {
    try {
      await setPackEnabled(id, enabled);
      toast.message(enabled ? "Pack enabled" : "Pack disabled", {
        description: "Close Minecraft if the change does not apply in-game.",
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not update options.txt. Close Minecraft and try again.",
      );
    }
  };

  const onOpenFolder = () => {
    void openInstanceSubdir(buildId, "resourcepacks").catch((err) => {
      toast.error(err instanceof Error ? err.message : "Could not open folder");
    });
  };

  const onAddPack = async () => {
    try {
      const paths = await pickContentFiles("resourcepacks");
      if (!paths.length) return;
      const result = await importInstanceFiles(buildId, "resourcepacks", paths);
      if (result.reroutes.length) {
        toast.message(`Routed “${result.reroutes[0].name}” to ${result.reroutes[0].toKind}`);
      }
      if (location) await scan(location);
      const n = result.imported;
      toast.success(n ? `Added ${n} pack${n === 1 ? "" : "s"}` : "No files imported");
    } catch (err) {
      if (!isImportCancelled(err)) {
        toast.error(err instanceof Error ? err.message : "Could not add pack");
      }
    }
  };

  const onAddDatapack = async () => {
    try {
      const paths = await pickContentFiles("datapacks");
      if (!paths.length) return;
      const result = await importInstanceFiles(buildId, "datapacks", paths);
      if (result.reroutes.length) {
        toast.message(`Routed “${result.reroutes[0].name}” to ${result.reroutes[0].toKind}`);
      }
      if (location) await scan(location);
      const n = result.imported;
      toast.success(
        n ? `Added ${n} datapack${n === 1 ? "" : "s"}` : "No files imported",
      );
    } catch (err) {
      if (!isImportCancelled(err)) {
        toast.error(
          err instanceof Error ? err.message : "Could not add datapack",
        );
      }
    }
  };

  return (
    <>
      <ContentListShell
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search resource packs…"
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
            : { label: "Add pack", onClick: () => void onAddPack() }
        }
        note={
          managed ? (
            <ManagedBuildBanner />
          ) : (
            <p className="text-[11px] text-text-muted px-0.5">
              Enabled packs write to options.txt (resourcePacks).{" "}
              <button
                type="button"
                onClick={onOpenFolder}
                className="underline underline-offset-2 hover:text-text-secondary cursor-pointer"
              >
                Open folder
              </button>
              {" · "}
              <button
                type="button"
                onClick={() => void onAddDatapack()}
                className="underline underline-offset-2 hover:text-text-secondary cursor-pointer"
              >
                Add datapack
              </button>
              {" · "}
              <button
                type="button"
                onClick={() => setDatapackUrlOpen(true)}
                className="underline underline-offset-2 hover:text-text-secondary cursor-pointer"
              >
                Datapack URL
              </button>
            </p>
          )
        }
        empty={filtered.length === 0}
        emptyLabel={scanning ? "Scanning packs…" : "No resource packs found"}
      >
        {filtered.map((p) => (
          <PackRow key={p.id} item={p} locked={managed} onToggle={onToggle} />
        ))}
      </ContentListShell>
      <ImportUrlModal
        open={urlOpen}
        title="Import resource pack from URL"
        onClose={() => setUrlOpen(false)}
        onSubmit={async (url) => {
          await importContentFromUrl("resourcepacks", url);
          toast.success("Resource pack imported");
        }}
      />
      <ImportUrlModal
        open={datapackUrlOpen}
        title="Import datapack from URL"
        onClose={() => setDatapackUrlOpen(false)}
        onSubmit={async (url) => {
          await importContentFromUrl("datapacks", url);
          toast.success("Datapack imported");
        }}
      />
    </>
  );
}
