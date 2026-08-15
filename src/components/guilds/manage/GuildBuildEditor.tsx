import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { GuildBuildRelease } from "../../../types/buildManifest";
import type { GuildActionResult } from "../../../stores/guilds";
import { useGuildStore } from "../../../stores/guilds";
import {
  fetchModrinthGameVersions,
  type ModrinthPickResult,
} from "../../../lib/modrinth";
import { cn } from "../../../lib/cn";
import { CfSelect } from "../../ui/CfSelect";
import {
  BuildImageField,
  buildImageIsReady,
  emptyBuildImageDraft,
  type BuildImageDraft,
} from "./BuildImageField";
import {
  ModrinthCatalogPicker,
  type ModrinthPickWithOptional,
} from "./ModrinthCatalogPicker";
import { GUILD_BUILD_IMAGE_URL_MAX } from "../../../lib/guildBuildApi";

const fieldClass =
  "h-9 w-full rounded-lg border border-border-subtle bg-black/25 px-3 text-[12px] text-text-primary outline-none focus:border-primary-base/45 [color-scheme:dark]";

const LOADERS = ["fabric", "forge", "neoforge", "quilt", "vanilla"] as const;

type TabId = "basics" | "mods" | "content" | "links";
type ContentKind = "resourcepack" | "datapack" | "shader";

const TABS: { id: TabId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "mods", label: "Mods" },
  { id: "content", label: "Packs & shaders" },
  { id: "links", label: "Links & publish" },
];

const CONTENT_SEGMENTS: { id: ContentKind; label: string }[] = [
  { id: "resourcepack", label: "Resource packs" },
  { id: "datapack", label: "Datapacks" },
  { id: "shader", label: "Shaders" },
];

/** Persist datapacks inside optional_mods until the API has a dedicated field. */
const DATAPACK_SLUG_PREFIX = "cf-datapack:";

function withDatapackSlug(slug: string): string {
  const clean = slug.replace(/^cf-datapack:/i, "").trim();
  return `${DATAPACK_SLUG_PREFIX}${clean || "pack"}`;
}

function stripDatapackSlug(slug: string): string {
  return slug.replace(/^cf-datapack:/i, "");
}

function isDatapackRef(ref: { slug?: string }): boolean {
  return Boolean(ref.slug && /^cf-datapack:/i.test(ref.slug));
}

function picksFromRefs(
  refs:
    | {
        name: string;
        slug?: string;
        version?: string;
        sourceUrl?: string;
      }[]
    | undefined,
  projectType: string,
  optional = false,
): ModrinthPickWithOptional[] {
  if (!refs?.length) return [];
  return refs.map((r, i) => {
    const rawSlug = r.slug ?? r.name.toLowerCase().replace(/\s+/g, "-");
    const slug =
      projectType === "datapack" ? stripDatapackSlug(rawSlug) : rawSlug;
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

function picksToRefs(picks: ModrinthPickResult[]) {
  return picks.map((p) => ({
    name: p.name,
    slug: p.slug,
    version: p.version,
    sourceUrl: p.sourceUrl,
  }));
}

function datapacksToRefs(picks: ModrinthPickResult[]) {
  return picks.map((p) => ({
    name: p.name,
    slug: withDatapackSlug(p.slug),
    version: p.version,
    sourceUrl: p.sourceUrl,
  }));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

type Props = {
  guildId: string;
  targetBuild?: GuildBuildRelease;
  onFinish: (
    result: GuildActionResult | Promise<GuildActionResult>,
  ) => Promise<void>;
};

export function GuildBuildEditor({ guildId, targetBuild, onFinish }: Props) {
  const saveBuildRelease = useGuildStore((s) => s.saveBuildRelease);
  const deleteBuildRelease = useGuildStore((s) => s.deleteBuildRelease);

  const [tab, setTab] = useState<TabId>("basics");
  const [contentKind, setContentKind] = useState<ContentKind>("resourcepack");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [mcVersions, setMcVersions] = useState<string[]>(["1.20.1", "1.21.1"]);

  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [loader, setLoader] = useState("fabric");
  const [minecraft, setMinecraft] = useState("1.20.1");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [coverImage, setCoverImage] = useState<BuildImageDraft>(() =>
    emptyBuildImageDraft(),
  );
  const [iconImage, setIconImage] = useState<BuildImageDraft>(() =>
    emptyBuildImageDraft(),
  );
  const [isPublished, setIsPublished] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [mods, setMods] = useState<ModrinthPickWithOptional[]>([]);
  const [resourcePacks, setResourcePacks] = useState<ModrinthPickWithOptional[]>(
    [],
  );
  const [datapacks, setDatapacks] = useState<ModrinthPickWithOptional[]>([]);
  const [shaders, setShaders] = useState<ModrinthPickWithOptional[]>([]);

  useEffect(() => {
    void fetchModrinthGameVersions()
      .then((list) => {
        if (list.length) setMcVersions(list.slice(0, 80));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setName(targetBuild?.name ?? "");
    setVersion(targetBuild?.version ?? "1.0.0");
    setLoader(
      String(targetBuild?.dependencies.loader ?? "fabric")
        .toLowerCase()
        .split(/\s+/)[0] || "fabric",
    );
    setMinecraft(targetBuild?.dependencies.minecraft ?? "1.20.1");
    setTagline(targetBuild?.tagline ?? targetBuild?.summary ?? "");
    setDescription(targetBuild?.description ?? "");
    setDownloadUrl(targetBuild?.downloadUrl ?? "");
    setSourceUrl(targetBuild?.sourceUrl ?? "");
    const cover =
      targetBuild?.coverUrl ??
      (targetBuild?.image?.startsWith("http") ? targetBuild.image : "") ??
      "";
    const icon =
      (typeof targetBuild?.iconUrl === "string" &&
      targetBuild.iconUrl.startsWith("http")
        ? targetBuild.iconUrl
        : "") ||
      (targetBuild?.image?.startsWith("http") && targetBuild.image !== cover
        ? targetBuild.image
        : "") ||
      cover;
    setCoverImage(emptyBuildImageDraft(cover));
    setIconImage(emptyBuildImageDraft(icon));
    setIsPublished(targetBuild?.isPublished !== false);
    setIsFeatured(Boolean(targetBuild?.isFeatured));
    setMods([
      ...picksFromRefs(targetBuild?.requiredMods, "mod", false),
      ...picksFromRefs(
        (targetBuild?.optionalMods ?? []).filter((r) => !isDatapackRef(r)),
        "mod",
        true,
      ),
    ]);
    setResourcePacks(picksFromRefs(targetBuild?.resourcePacks, "resourcepack"));
    setShaders(picksFromRefs(targetBuild?.shaders, "shader"));
    setDatapacks(
      picksFromRefs(
        (targetBuild?.optionalMods ?? []).filter((r) => isDatapackRef(r)),
        "datapack",
        false,
      ),
    );
    setConfirmed(false);
    setTab("basics");
    setContentKind("resourcepack");
  }, [targetBuild, guildId]);

  const mcOptions = useMemo(() => {
    const values = mcVersions.includes(minecraft)
      ? mcVersions
      : [minecraft, ...mcVersions];
    return values.map((v) => ({ value: v, label: v }));
  }, [mcVersions, minecraft]);

  const loaderOptions = useMemo(
    () => LOADERS.map((id) => ({ value: id, label: id })),
    [],
  );

  const contentSelected =
    contentKind === "resourcepack"
      ? resourcePacks
      : contentKind === "datapack"
        ? datapacks
        : shaders;
  const setContentSelected =
    contentKind === "resourcepack"
      ? setResourcePacks
      : contentKind === "datapack"
        ? setDatapacks
        : setShaders;

  const save = () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error("Name must be 2-120 characters.");
      setTab("basics");
      return;
    }
    if (!version.trim()) {
      toast.error("Add a version.");
      setTab("basics");
      return;
    }
    const hasExistingCover = Boolean(
      targetBuild?.coverUrl ||
        (targetBuild?.image && targetBuild.image.startsWith("http")),
    );
    const hasExistingIcon = Boolean(
      targetBuild?.iconUrl ||
        (targetBuild?.image && targetBuild.image.startsWith("http")),
    );
    if (!buildImageIsReady(coverImage, hasExistingCover)) {
      toast.error("Add a cover image URL or upload a PNG/JPEG/WebP.");
      setTab("links");
      return;
    }
    if (!buildImageIsReady(iconImage, hasExistingIcon)) {
      toast.error("Add a build icon URL or upload a PNG/JPEG/WebP.");
      setTab("links");
      return;
    }
    if (
      coverImage.url.trim() &&
      (!isHttpUrl(coverImage.url) ||
        coverImage.url.trim().length > GUILD_BUILD_IMAGE_URL_MAX)
    ) {
      toast.error("Cover URL must be http(s) and at most 500 characters.");
      setTab("links");
      return;
    }
    if (
      iconImage.url.trim() &&
      (!isHttpUrl(iconImage.url) ||
        iconImage.url.trim().length > GUILD_BUILD_IMAGE_URL_MAX)
    ) {
      toast.error("Icon URL must be http(s) and at most 500 characters.");
      setTab("links");
      return;
    }
    if (downloadUrl.trim() && !isHttpUrl(downloadUrl)) {
      toast.error("Pack zip download_url must be an http(s) URL.");
      setTab("links");
      return;
    }
    if (sourceUrl.trim() && !isHttpUrl(sourceUrl)) {
      toast.error("source_url must be an http(s) URL.");
      setTab("links");
      return;
    }

    const requiredMods = mods.filter((m) => !m.optional);
    const optionalMods = [
      ...picksToRefs(mods.filter((m) => m.optional)),
      ...datapacksToRefs(datapacks),
    ];

    const iconUrlOut = iconImage.upload
      ? null
      : iconImage.url.trim() || targetBuild?.iconUrl || null;
    const coverUrlOut = coverImage.upload
      ? null
      : coverImage.url.trim() || targetBuild?.coverUrl || null;

    const item: GuildBuildRelease = {
      id: targetBuild?.id ?? `release-${Date.now()}`,
      buildId: targetBuild?.buildId ?? "custom",
      guildId,
      serverId: targetBuild?.serverId ?? "",
      name: name.trim(),
      summary: tagline.trim(),
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      version: version.trim(),
      publishedAt: targetBuild?.publishedAt ?? "Just now",
      publishedAtIso: targetBuild?.publishedAtIso ?? new Date().toISOString(),
      image:
        iconImage.preview ||
        iconUrlOut ||
        coverImage.preview ||
        coverUrlOut ||
        targetBuild?.image ||
        "",
      iconUrl: iconUrlOut,
      downloadUrl: downloadUrl.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      coverUrl: coverUrlOut,
      isPublished,
      isFeatured,
      requiredMods: picksToRefs(requiredMods),
      optionalMods,
      shaders: picksToRefs(shaders),
      resourcePacks: picksToRefs(resourcePacks),
      dependencies: {
        minecraft: minecraft.trim() || "1.20.1",
        loader: loader.trim() || "fabric",
        java: targetBuild?.dependencies.java ?? "17+",
      },
      sizes: {
        downloadBytes: targetBuild?.sizes.downloadBytes ?? 0,
        installedBytes: targetBuild?.sizes.installedBytes ?? 0,
      },
      content: {
        mods: mods.length,
        resourcePacks: resourcePacks.length,
        shaders: shaders.length,
        configs: 0,
      },
      changelog: targetBuild?.changelog ?? [],
      excludes: targetBuild?.excludes ?? ["saves/**"],
    };

    setSaving(true);
    void onFinish(
      saveBuildRelease(item, {
        iconUpload: iconImage.upload,
        coverUpload: coverImage.upload,
      }),
    ).finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted">
        Saved to the CultForge guild catalog. Add Modrinth content, then set a
        cover and icon before publishing.
      </p>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border-subtle bg-black/20 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer",
              tab === t.id
                ? "bg-primary-base/20 text-primary-base"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "basics" && (
        <div className="flex flex-col gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
            placeholder="Build name (required)"
            maxLength={120}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className={fieldClass}
              placeholder="Pack version"
            />
            <CfSelect
              value={loader}
              onChange={setLoader}
              options={loaderOptions}
              aria-label="Mod loader"
            />
          </div>
          <CfSelect
            value={minecraft}
            onChange={setMinecraft}
            options={mcOptions}
            aria-label="Minecraft version"
            searchable
            maxMenuHeight="12rem"
          />
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className={fieldClass}
            placeholder="Tagline"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${fieldClass} h-auto min-h-24 resize-y py-2.5`}
            placeholder="Description (markdown OK)"
          />
        </div>
      )}

      {tab === "mods" && (
        <ModrinthCatalogPicker
          label="Mods"
          projectType="mod"
          loader={loader}
          gameVersion={minecraft}
          selected={mods}
          onChange={setMods}
          allowOptionalToggle
        />
      )}

      {tab === "content" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border-subtle bg-black/15 p-1">
            {CONTENT_SEGMENTS.map((seg) => {
              const count =
                seg.id === "resourcepack"
                  ? resourcePacks.length
                  : seg.id === "datapack"
                    ? datapacks.length
                    : shaders.length;
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setContentKind(seg.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer",
                    contentKind === seg.id
                      ? "bg-primary-base/20 text-primary-base"
                      : "text-text-muted hover:text-text-secondary",
                  )}
                >
                  {seg.label}
                  {count > 0 ? (
                    <span className="ml-1 text-text-disabled">({count})</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <ModrinthCatalogPicker
            key={contentKind}
            label={
              CONTENT_SEGMENTS.find((s) => s.id === contentKind)?.label ??
              "Content"
            }
            projectType={contentKind}
            gameVersion={minecraft}
            selected={contentSelected}
            onChange={setContentSelected}
            compact
          />
        </div>
      )}

      {tab === "links" && (
        <div className="flex flex-col gap-2.5">
          <BuildImageField
            kind="cover"
            label="Cover image"
            value={coverImage}
            onChange={setCoverImage}
            existingHint={targetBuild?.coverUrl ?? null}
          />
          <BuildImageField
            kind="icon"
            label="Build icon"
            value={iconImage}
            onChange={setIconImage}
            existingHint={targetBuild?.iconUrl ?? null}
          />
          <p className="text-[10px] text-text-muted">
            Paste a public image link, or upload a file (saved as JSON base64 after the
            build exists — not multipart).
          </p>
          <input
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            className={fieldClass}
            placeholder="Optional pack zip download_url (https://…)"
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className={fieldClass}
            placeholder="Source page URL (optional)"
          />
          <label className="flex items-center gap-2 text-[10px] text-text-muted">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
            Published (visible to members)
          </label>
          <label className="flex items-center gap-2 text-[10px] text-text-muted">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            Featured
          </label>
          <p className="text-[10px] text-text-muted">
            Summary: {mods.filter((m) => !m.optional).length} required ·{" "}
            {mods.filter((m) => m.optional).length} optional ·{" "}
            {resourcePacks.length} packs · {datapacks.length} datapacks ·{" "}
            {shaders.length} shaders
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="cf-btn-primary rounded-lg px-4 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save build"}
        </button>
        {targetBuild && (
          <>
            <label className="flex items-center gap-2 text-[9px] text-text-muted">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Confirm delete
            </label>
            <button
              type="button"
              disabled={!confirmed || saving}
              onClick={() => {
                setSaving(true);
                void onFinish(deleteBuildRelease(guildId, targetBuild.id)).finally(
                  () => setSaving(false),
                );
              }}
              className="rounded-lg border border-state-error/30 px-3 py-2 text-[10px] text-state-error disabled:opacity-35 cursor-pointer"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
