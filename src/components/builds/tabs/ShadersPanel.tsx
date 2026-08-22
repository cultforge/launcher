import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { toast } from "sonner";
import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { shaderItemFrom, type ShaderItem } from "../../../data/buildContent";
import { useBuildStore } from "../../../stores/build";
import { useLibraryContentStore } from "../../../stores/libraryContent";
import { shaderMatchesActive } from "../../../lib/minecraftOptions";
import { ContentListShell } from "./ContentListShell";
import { ManagedBuildBanner } from "./ManagedBuildBanner";
import { cn } from "../../../lib/cn";
import type { ContentFilter } from "../../../data/buildContent";
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

const FILTERS: ContentFilter[] = ["All"];

function ShaderRow({
  item,
  active,
  locked,
  onSelect,
}: {
  item: ShaderItem;
  active: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onSelect}
      disabled={locked}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-left w-full transition-colors",
        locked ? "cursor-default opacity-90" : "cursor-pointer",
        active ? "bg-primary-base/10" : !locked && "hover:bg-bg-elevated",
      )}
    >
      <div
        className={cn(
          "h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center",
          active ? "border-primary-base" : "border-white/20",
        )}
      >
        {active && (
          <span className="h-2 w-2 rounded-full bg-primary-base" />
        )}
      </div>
      {item.image ? (
        <img
          src={item.image}
          alt=""
          className="h-9 w-9 rounded-lg shrink-0 border border-border-subtle object-cover"
        />
      ) : (
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border border-border-subtle bg-white/4 text-text-secondary">
          <Icon icon={AppIcons.Images} size={15} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-text-primary font-medium truncate">
            {item.name}
          </span>
          {active && (
            <Chip size="sm" variant="soft" color="success">
              <Chip.Label className="text-[9px] text-primary-base">
                Active
              </Chip.Label>
            </Chip>
          )}
        </div>
        <div className="text-[10px] text-text-muted">
          {item.version} · {item.size}
        </div>
      </div>
    </button>
  );
}

export function ShadersPanel() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContentFilter>("All");
  const [urlOpen, setUrlOpen] = useState(false);
  const managed = useBuildStore((s) => s.active().managed);
  const buildId = useBuildStore((s) => s.activeId);
  const location = useBuildStore((s) => s.active().location);

  const libraryItems = useLibraryContentStore((s) => s.items);
  const scanning = useLibraryContentStore((s) => s.scanning);
  const activeShaderName = useLibraryContentStore((s) => s.activeShaderName);
  const loadOptions = useLibraryContentStore((s) => s.loadOptions);
  const setActiveShaderPack = useLibraryContentStore(
    (s) => s.setActiveShaderPack,
  );
  const scan = useLibraryContentStore((s) => s.scan);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const items = useMemo<ShaderItem[]>(
    () =>
      libraryItems
        .filter((item) => item.kind === "shader")
        .map(shaderItemFrom),
    [libraryItems],
  );

  const fileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of libraryItems) {
      if (item.kind === "shader") map.set(item.id, item.fileName);
    }
    return map;
  }, [libraryItems]);

  const filtered = items.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const onSelect = async (id: string) => {
    const fileName = fileNameById.get(id) ?? null;
    if (!fileName) return;
    const alreadyActive = shaderMatchesActive(fileName, activeShaderName);
    try {
      await setActiveShaderPack(alreadyActive ? null : fileName);
      toast.message(alreadyActive ? "Shader cleared" : "Shader selected", {
        description: "Written to this build’s options.txt (shaderPack).",
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
    void openInstanceSubdir(buildId, "shaderpacks").catch((err) => {
      toast.error(err instanceof Error ? err.message : "Could not open folder");
    });
  };

  const onAddShader = async () => {
    try {
      const paths = await pickContentFiles("shaderpacks");
      if (!paths.length) return;
      const result = await importInstanceFiles(buildId, "shaderpacks", paths);
      if (location) await scan(location);
      const n = result.imported;
      toast.success(
        n ? `Added ${n} shader${n === 1 ? "" : "s"}` : "No files imported",
      );
    } catch (err) {
      if (!isImportCancelled(err)) {
        toast.error(err instanceof Error ? err.message : "Could not add shader");
      }
    }
  };

  return (
    <>
      <ContentListShell
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search shaders…"
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
            : { label: "Add shader", onClick: () => void onAddShader() }
        }
        note={
          managed ? (
            <ManagedBuildBanner />
          ) : (
            <p className="text-[11px] text-text-muted px-0.5">
              Requires Iris (Fabric) or Oculus (Forge). Selection writes
              options.txt shaderPack.{" "}
              <button
                type="button"
                onClick={onOpenFolder}
                className="underline underline-offset-2 hover:text-text-secondary cursor-pointer"
              >
                Open shaderpacks folder
              </button>
            </p>
          )
        }
        empty={filtered.length === 0}
        emptyLabel={scanning ? "Scanning shaders…" : "No shader packs found"}
      >
        {filtered.map((s) => {
          const fileName = fileNameById.get(s.id) ?? "";
          return (
            <ShaderRow
              key={s.id}
              item={s}
              locked={managed}
              active={shaderMatchesActive(fileName, activeShaderName)}
              onSelect={() => void onSelect(s.id)}
            />
          );
        })}
      </ContentListShell>
      <ImportUrlModal
        open={urlOpen}
        title="Import shader from URL"
        onClose={() => setUrlOpen(false)}
        onSubmit={async (url) => {
          await importContentFromUrl("shaderpacks", url);
          toast.success("Shader imported");
        }}
      />
    </>
  );
}
