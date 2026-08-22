import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUserBuildsStore } from "../../../../stores/userBuilds";
import { isValidKeyword, normalizeKeywords } from "../../../../types/catalog";
import type { UserBuildRecord } from "../../../../types/catalog";
import type { GuildBuildModRef } from "../../../../types/buildManifest";
import type { UserBuildWritePayload } from "../../../../lib/userBuildsApi";
import {
  ModrinthCatalogPicker,
  type ModrinthPickWithOptional,
} from "../../../guilds/manage/ModrinthCatalogPicker";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";
import { cn } from "../../../../lib/cn";

function picksFromRefs(
  refs: GuildBuildModRef[] | undefined,
  projectType: string,
  optional = false,
): ModrinthPickWithOptional[] {
  if (!refs?.length) return [];
  return refs.map((r, i) => {
    const slug = r.slug ?? r.name.toLowerCase().replace(/\s+/g, "-");
    return {
      name: r.name,
      slug,
      version: r.version ?? "",
      sourceUrl: r.sourceUrl ?? "",
      projectId: slug || `local-${i}`,
      versionId: r.version ?? `v-${i}`,
      projectType,
      optional,
    };
  });
}

function picksToRefs(picks: ModrinthPickWithOptional[]): GuildBuildModRef[] {
  return picks.map((p) => ({
    name: p.name,
    slug: p.slug,
    version: p.version,
    sourceUrl: p.sourceUrl,
  }));
}

function KeywordInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().toLowerCase();
    if (!tag) return;
    if (!isValidKeyword(tag)) {
      toast.error("Keywords must be 1–13 characters, lowercase letters, numbers, _ or -");
      return;
    }
    if (value.length >= 13) {
      toast.error("Maximum 13 keywords per build");
      return;
    }
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {value.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-md bg-white/6 border border-white/10 px-2 py-0.5 text-[9px] text-text-muted"
          >
            {k}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== k))}
              className="text-text-disabled hover:text-state-error cursor-pointer"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 13))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add keyword…"
          className="flex-1 rounded-md border border-border-strong bg-black/20 px-2 py-1.5 text-[10px] text-text-primary outline-none placeholder:text-text-disabled"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-white/12 px-2 py-1 text-[9px] text-text-secondary cursor-pointer"
        >
          Add
        </button>
      </div>
      <p className="text-[8px] text-text-disabled">
        {value.length}/13 keywords · lowercase, a-z 0-9 _ - only
      </p>
    </div>
  );
}

function BuildEditor({
  build,
  onSave,
  onCancel,
}: {
  build: UserBuildRecord | null;
  onSave: (data: UserBuildWritePayload) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<"basics" | "mods" | "packs">("basics");
  const [name, setName] = useState(build?.name ?? "");
  const [mc, setMc] = useState(build?.minecraftVersion ?? "1.20.1");
  const [loader, setLoader] = useState(build?.loader ?? "fabric");
  const [tagline, setTagline] = useState(build?.tagline ?? "");
  const [published, setPublished] = useState(build?.isPublished ?? true);
  const [publicCatalog, setPublicCatalog] = useState(build?.isPublicCatalog ?? false);
  const [kw, setKw] = useState<string[]>(build?.keywords ?? []);
  const [mods, setMods] = useState<ModrinthPickWithOptional[]>(() => [
    ...picksFromRefs(build?.requiredMods, "mod", false),
    ...picksFromRefs(build?.optionalMods, "mod", true),
  ]);
  const [packs, setPacks] = useState<ModrinthPickWithOptional[]>(() =>
    picksFromRefs(build?.resourcePacks, "resourcepack"),
  );
  const [shaders, setShaders] = useState<ModrinthPickWithOptional[]>(() =>
    picksFromRefs(build?.shaders, "shader"),
  );
  const [packKind, setPackKind] = useState<"resourcepack" | "shader">(
    "resourcepack",
  );

  const save = () => {
    onSave({
      name: name.trim(),
      minecraftVersion: mc,
      loader,
      tagline,
      isPublished: published,
      isPublicCatalog: publicCatalog,
      keywords: normalizeKeywords(kw),
      requiredMods: picksToRefs(mods.filter((m) => !m.optional)),
      optionalMods: picksToRefs(mods.filter((m) => m.optional)),
      resourcePacks: picksToRefs(packs),
      shaders: picksToRefs(shaders),
    });
  };

  return (
    <div className="cf-panel rounded-xl p-4 flex flex-col gap-3">
      <h3 className="font-sora text-[14px] font-bold text-text-primary">
        {build ? "Edit build" : "New build"}
      </h3>
      <div className="flex gap-1 rounded-lg border border-white/8 bg-black/15 p-1">
        {(
          [
            ["basics", "Basics"],
            ["mods", `Mods (${mods.length})`],
            ["packs", `Packs (${packs.length + shaders.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold cursor-pointer",
              tab === id
                ? "bg-primary-base/20 text-primary-base"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "basics" && (
        <>
      <label className="flex flex-col gap-1 text-[10px] text-text-muted">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Minecraft version
          <input
            value={mc}
            onChange={(e) => setMc(e.target.value)}
            className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          Loader
          <select
            value={loader}
            onChange={(e) => setLoader(e.target.value)}
            className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary outline-none cursor-pointer"
          >
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
            <option value="quilt">Quilt</option>
            <option value="vanilla">Vanilla</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[10px] text-text-muted">
        Tagline
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Short description shown in the catalog"
          className="rounded-md border border-border-strong bg-black/20 px-2.5 py-2 text-[11px] text-text-primary outline-none placeholder:text-text-disabled"
        />
      </label>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="accent-primary-base"
          />
          Published
        </label>
        <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={publicCatalog}
            onChange={(e) => setPublicCatalog(e.target.checked)}
            disabled={!published}
            className="accent-primary-base"
          />
          Share in public catalog
        </label>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-text-muted mb-1">Keywords</p>
        <KeywordInput value={kw} onChange={setKw} />
      </div>
        </>
      )}

      {tab === "mods" && (
        <ModrinthCatalogPicker
          label="Mods"
          projectType="mod"
          loader={loader}
          gameVersion={mc}
          selected={mods}
          onChange={setMods}
          allowOptionalToggle
          compact
        />
      )}

      {tab === "packs" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPackKind("resourcepack")}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] cursor-pointer",
                packKind === "resourcepack"
                  ? "bg-primary-base/20 text-primary-base"
                  : "text-text-muted",
              )}
            >
              Resource packs ({packs.length})
            </button>
            <button
              type="button"
              onClick={() => setPackKind("shader")}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] cursor-pointer",
                packKind === "shader"
                  ? "bg-primary-base/20 text-primary-base"
                  : "text-text-muted",
              )}
            >
              Shaders ({shaders.length})
            </button>
          </div>
          {packKind === "resourcepack" ? (
            <ModrinthCatalogPicker
              label="Resource packs"
              projectType="resourcepack"
              gameVersion={mc}
              selected={packs}
              onChange={setPacks}
              compact
            />
          ) : (
            <ModrinthCatalogPicker
              label="Shaders"
              projectType="shader"
              gameVersion={mc}
              selected={shaders}
              onChange={setShaders}
              compact
            />
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          disabled={!name.trim()}
          onClick={save}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
        >
          {build ? "Save changes" : "Create build"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/12 px-4 py-2 text-[11px] text-text-secondary cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MyBuildsPage() {
  const builds = useUserBuildsStore((s) => s.builds);
  const loading = useUserBuildsStore((s) => s.loading);
  const error = useUserBuildsStore((s) => s.error);
  const refresh = useUserBuildsStore((s) => s.refresh);
  const editing = useUserBuildsStore((s) => s.editing);
  const setEditing = useUserBuildsStore((s) => s.setEditing);
  const createBuild = useUserBuildsStore((s) => s.create);
  const updateBuild = useUserBuildsStore((s) => s.update);
  const removeBuild = useUserBuildsStore((s) => s.remove);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  const editTarget = builds.find((b) => b.id === editing) ?? null;

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora text-xl font-bold text-text-primary">
            My Builds
          </h1>
          <p className="text-[11px] text-text-muted mt-1">
            Create and publish your own Minecraft build configs for the
            community.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer"
        >
          New build
        </button>
      </div>

      {creating && (
        <BuildEditor
          build={null}
          onSave={async (data) => {
            try {
              await createBuild(data);
              setCreating(false);
              toast.success("Build created");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not create build",
              );
            }
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {editing && editTarget && (
        <BuildEditor
          build={editTarget}
          onSave={async (data) => {
            try {
              await updateBuild(editing, data);
              setEditing(null);
              toast.success("Build updated");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not update build",
              );
            }
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {error && (
        <div className="rounded-lg border border-state-error/20 bg-state-error/6 px-3 py-2.5 text-[11px] text-state-error">
          {error}
        </div>
      )}

      {loading && builds.length === 0 && (
        <div className="cf-panel rounded-xl flex items-center justify-center min-h-40 text-[12px] text-text-muted">
          Loading your builds…
        </div>
      )}

      {!loading && builds.length === 0 && !error && (
        <div className="cf-panel rounded-xl flex flex-col items-center justify-center min-h-40 gap-2 text-center px-4">
          <Icon icon={AppIcons.Builds} size={28} className="text-text-disabled" />
          <p className="text-[13px] text-text-muted">
            You haven't created any builds yet.
          </p>
          <p className="text-[10px] text-text-disabled max-w-sm">
            Builds let you package your mods, resource packs, and configs into a
            shareable config that others can install.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {builds.map((build) => (
          <div
            key={build.id}
            className="cf-panel rounded-xl flex items-center gap-3 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-text-primary">
                  {build.name}
                </span>
                {build.isPublicCatalog && build.isPublished && (
                  <span className="rounded-full bg-primary-base/12 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-primary-base">
                    Public
                  </span>
                )}
                {build.isPublished && !build.isPublicCatalog && (
                  <span className="rounded-full bg-white/6 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-text-muted">
                    Published
                  </span>
                )}
                {!build.isPublished && (
                  <span className="rounded-full bg-white/6 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-text-disabled">
                    Draft
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-text-muted">
                <span>{build.loader}</span>
                <span>MC {build.minecraftVersion}</span>
                {build.hasInstallManifest && (
                  <span className="text-state-success">Manifest ready</span>
                )}
                {build.isInstallable && (
                  <span className="text-primary-base">Installable</span>
                )}
                {build.installMode && (
                  <span className="text-text-disabled">{build.installMode}</span>
                )}
                {build.keywords.length > 0 && (
                  <span>{build.keywords.join(", ")}</span>
                )}
                {(build.requiredMods?.length ?? 0) > 0 && (
                  <span>{build.requiredMods?.length} mods</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setEditing(build.id);
                }}
                className="rounded-md border border-white/12 px-2.5 py-1.5 text-[9px] text-text-secondary cursor-pointer hover:bg-white/5"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await removeBuild(build.id);
                    toast.success("Build deleted");
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Could not delete build",
                    );
                  }
                }}
                className="rounded-md border border-state-error/20 px-2.5 py-1.5 text-[9px] text-state-error cursor-pointer hover:bg-state-error/8"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
