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
import {
  canPublishPublicCatalog,
  membershipForUser,
} from "../../../lib/guildPermissions";
import { getGuild } from "../../../data/guilds";
import { useAppStore } from "../../../userstore";

const fieldClass =
  "h-9 w-full rounded-lg border border-border-subtle bg-black/25 px-3 text-[12px] text-text-primary outline-none focus:border-primary-base/45 [color-scheme:dark]";

const LOADERS = ["fabric", "forge", "neoforge", "quilt", "vanilla"] as const;

type TabId = "basics" | "mods" | "content" | "links";
type ContentKind = "resourcepack" | "datapack" | "shader";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "basics", label: "Name it", hint: "What players will see" },
  { id: "mods", label: "Mods", hint: "Search & add from Modrinth" },
  { id: "content", label: "Extras", hint: "Packs, datapacks, shaders" },
  { id: "links", label: "Publish", hint: "Artwork & visibility" },
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
        versionId?: string;
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
      versionId: r.versionId ?? "",
      projectType,
      optional,
    };
  });
}

function picksToRefs(picks: ModrinthPickResult[]) {
  return picks.map((p) => ({
    name: p.name,
    slug: p.slug,
    version: p.version || "latest",
    versionId: p.versionId || undefined,
    sourceUrl: p.sourceUrl,
  }));
}

function datapacksToRefs(picks: ModrinthPickResult[]) {
  return picks.map((p) => ({
    name: p.name,
    slug: withDatapackSlug(p.slug),
    version: p.version || "latest",
    versionId: p.versionId || undefined,
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
  layout?: "compact" | "full";
};

export function GuildBuildEditor({ guildId, targetBuild, onFinish, layout = "compact" }: Props) {
  const saveBuildRelease = useGuildStore((s) => s.saveBuildRelease);
  const deleteBuildRelease = useGuildStore((s) => s.deleteBuildRelease);
  const members = useGuildStore((s) => s.members);
  const viewerPermissionsByGuild = useGuildStore(
    (s) => s.viewerPermissionsByGuild,
  );
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const guildOwnerId = getGuild(guildId)?.ownerId;
  const actorMember = membershipForUser(members, guildId, userId);
  const canCatalog = canPublishPublicCatalog({
    role: actorMember?.role,
    permissions: viewerPermissionsByGuild[guildId],
    isOwner: Boolean(guildOwnerId && guildOwnerId === userId),
  });

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
  const [isPublicCatalog, setIsPublicCatalog] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwDraft, setKwDraft] = useState("");
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
    setIsPublicCatalog(Boolean(targetBuild?.isPublicCatalog));
    setKeywords(targetBuild?.keywords ?? []);
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
      isPublicCatalog: isPublished ? isPublicCatalog : false,
      keywords: keywords.filter((k) => /^[a-z0-9_-]{1,13}$/.test(k)).slice(0, 13),
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

  const isFull = layout === "full";
  const activeTab = TABS.find((t) => t.id === tab)!;
  const modCount = mods.length;
  const extraCount = resourcePacks.length + datapacks.length + shaders.length;

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <p className="text-[12px] text-text-muted">
        {modCount} mod{modCount === 1 ? "" : "s"}
        {extraCount > 0 ? ` · ${extraCount} extra${extraCount === 1 ? "" : "s"}` : ""}
        {name.trim() ? ` · ${name.trim()}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {targetBuild ? (
          <>
            <label className="flex items-center gap-2 text-[11px] text-text-muted">
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
                void onFinish(
                  deleteBuildRelease(guildId, targetBuild.id),
                ).finally(() => setSaving(false));
              }}
              className="rounded-lg border border-state-error/30 px-3 py-2 text-[12px] text-state-error disabled:opacity-35 cursor-pointer"
            >
              Delete
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className={cn(
            "cf-btn-primary rounded-xl px-6 py-2.5 font-semibold cursor-pointer disabled:opacity-50",
            isFull ? "text-[13px]" : "text-[10px]",
          )}
        >
          {saving ? "Saving…" : "Save build"}
        </button>
      </div>
    </div>
  );

  if (isFull) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="build-editor flex min-h-0 flex-1 flex-col gap-5">
          <div className="flex min-h-0 flex-1 gap-6">
            <nav className="build-editor-nav hidden w-48 shrink-0 flex-col gap-1 lg:flex">
              {TABS.map((t) => {
                const badge =
                  t.id === "mods"
                    ? modCount
                    : t.id === "content"
                      ? extraCount
                      : 0;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-xl px-3 py-3 text-left cursor-pointer transition-colors",
                      tab === t.id
                        ? "bg-primary-base/14 text-primary-base"
                        : "text-text-muted hover:bg-white/4 hover:text-text-secondary",
                    )}
                  >
                    <span className="block text-[13px] font-semibold">{t.label}</span>
                    <span className="mt-0.5 block text-[11px] opacity-80">{t.hint}</span>
                    {badge > 0 ? (
                      <span className="mt-1 inline-block rounded-full bg-primary-base/16 px-2 py-0.5 text-[10px] font-semibold text-primary-base">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="flex min-w-0 flex-1 flex-col min-h-0">
              <div className="mb-4 lg:hidden">
                <div className="flex gap-1 overflow-x-auto scroll-hidden pb-1">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold cursor-pointer",
                        tab === t.id
                          ? "bg-primary-base/14 text-primary-base"
                          : "text-text-muted",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <header className="mb-4 shrink-0">
                <h2 className="font-sora text-[20px] font-bold text-text-primary">
                  {activeTab.label}
                </h2>
                <p className="mt-1 text-[13px] text-text-muted">{activeTab.hint}</p>
              </header>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {tab === "basics" && (
                  <div className="build-editor-scroll scrollbar-cultforge overflow-y-auto pr-1">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="flex flex-col gap-1.5 lg:col-span-2">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Pack name
                        </span>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className={fieldClass}
                          placeholder="e.g. CultForge SMP"
                          maxLength={120}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Version
                        </span>
                        <input
                          value={version}
                          onChange={(e) => setVersion(e.target.value)}
                          className={fieldClass}
                          placeholder="1.0.0"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Mod loader
                        </span>
                        <CfSelect
                          value={loader}
                          onChange={setLoader}
                          options={loaderOptions}
                          aria-label="Mod loader"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 lg:col-span-2">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Minecraft version
                        </span>
                        <CfSelect
                          value={minecraft}
                          onChange={setMinecraft}
                          options={mcOptions}
                          aria-label="Minecraft version"
                          searchable
                          maxMenuHeight="12rem"
                        />
                        <span className="text-[11px] text-text-disabled">
                          Modrinth search filters to this version
                          {loader && loader !== "vanilla"
                            ? ` and ${loader}`
                            : ""}{" "}
                          — use Show all on the Mods step to browse everything.
                        </span>
                      </label>
                      <label className="flex flex-col gap-1.5 lg:col-span-2">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Short tagline
                        </span>
                        <input
                          value={tagline}
                          onChange={(e) => setTagline(e.target.value)}
                          className={fieldClass}
                          placeholder="One line about this pack"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 lg:col-span-2">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Description
                        </span>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className={`${fieldClass} h-auto min-h-28 resize-y py-2.5`}
                          placeholder="What's in this pack? Markdown is OK."
                        />
                      </label>
                    </div>
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
                    variant="split"
                  />
                )}

                {tab === "content" && (
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex shrink-0 flex-wrap gap-1.5">
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
                              "rounded-full px-3 py-1.5 text-[12px] font-semibold cursor-pointer",
                              contentKind === seg.id
                                ? "bg-primary-base/16 text-primary-base"
                                : "bg-white/5 text-text-muted hover:text-text-secondary",
                            )}
                          >
                            {seg.label}
                            {count > 0 ? (
                              <span className="ml-1 opacity-70">({count})</span>
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
                      variant="split"
                    />
                  </div>
                )}

                {tab === "links" && (
                  <div className="build-editor-scroll scrollbar-cultforge overflow-y-auto pr-1">
                    <div className="grid gap-5 lg:grid-cols-2">
                      <BuildImageField
                        kind="cover"
                        label="Cover image"
                        value={coverImage}
                        onChange={setCoverImage}
                        existingHint={targetBuild?.coverUrl ?? null}
                      />
                      <BuildImageField
                        kind="icon"
                        label="Pack icon"
                        value={iconImage}
                        onChange={setIconImage}
                        existingHint={targetBuild?.iconUrl ?? null}
                      />
                    </div>
                    <p className="mt-3 text-[11px] text-text-muted">
                      Paste a public image link or upload PNG / JPEG / WebP.
                    </p>
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <label className="flex flex-col gap-1.5 lg:col-span-2">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Download link
                        </span>
                        <input
                          value={downloadUrl}
                          onChange={(e) => setDownloadUrl(e.target.value)}
                          className={fieldClass}
                          placeholder="Optional zip URL (https://…)"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 lg:col-span-2">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Source page
                        </span>
                        <input
                          value={sourceUrl}
                          onChange={(e) => setSourceUrl(e.target.value)}
                          className={fieldClass}
                          placeholder="Modrinth or project page (optional)"
                        />
                      </label>
                    </div>
                    <div className="mt-5 rounded-xl border border-border-subtle bg-black/15 p-4">
                      <p className="text-[12px] font-semibold text-text-secondary">
                        Visibility
                      </p>
                      <div className="mt-3 flex flex-col gap-2.5">
                        <label className="flex items-center gap-2.5 text-[12px] text-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isPublished}
                            onChange={(e) => setIsPublished(e.target.checked)}
                          />
                          Published — guild members can see and install
                        </label>
                        <label className="flex items-center gap-2.5 text-[12px] text-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isFeatured}
                            onChange={(e) => setIsFeatured(e.target.checked)}
                          />
                          Featured on guild home
                        </label>
                        <label className="flex items-center gap-2.5 text-[12px] text-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isPublicCatalog}
                            onChange={(e) => setIsPublicCatalog(e.target.checked)}
                            disabled={!isPublished || !canCatalog}
                          />
                          Share in public CultForge catalog
                        </label>
                      </div>
                      {!canCatalog ? (
                        <p className="mt-2 text-[11px] text-text-disabled">
                          Only officers can publish to the public catalog.
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-5 flex flex-col gap-2">
                      <p className="text-[12px] font-medium text-text-secondary">
                        Keywords ({keywords.length}/13)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.map((k) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded-full bg-white/6 border border-white/10 px-2.5 py-1 text-[11px] text-text-muted"
                          >
                            {k}
                            <button
                              type="button"
                              onClick={() =>
                                setKeywords(keywords.filter((v) => v !== k))
                              }
                              className="text-text-disabled hover:text-state-error cursor-pointer"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={kwDraft}
                          onChange={(e) => setKwDraft(e.target.value.slice(0, 13))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const tag = kwDraft.trim().toLowerCase();
                              if (
                                tag &&
                                /^[a-z0-9_-]{1,13}$/.test(tag) &&
                                keywords.length < 13 &&
                                !keywords.includes(tag)
                              ) {
                                setKeywords([...keywords, tag]);
                                setKwDraft("");
                              }
                            }
                          }}
                          placeholder="Add keyword…"
                          className="flex-1 rounded-lg border border-border-subtle bg-black/25 px-3 py-2 text-[12px] text-text-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const tag = kwDraft.trim().toLowerCase();
                            if (
                              tag &&
                              /^[a-z0-9_-]{1,13}$/.test(tag) &&
                              keywords.length < 13 &&
                              !keywords.includes(tag)
                            ) {
                              setKeywords([...keywords, tag]);
                              setKwDraft("");
                            }
                          }}
                          className="rounded-lg border border-white/12 px-3 py-2 text-[11px] text-text-secondary cursor-pointer hover:bg-white/4"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside className="build-editor-preview hidden w-52 shrink-0 xl:block">
              <div className="sticky top-0 rounded-xl border border-border-subtle bg-black/20 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Preview
                </p>
                <p className="mt-2 truncate font-sora text-[15px] font-bold text-text-primary">
                  {name.trim() || "Untitled pack"}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  {minecraft} · {loader} · v{version || "?"}
                </p>
                {tagline.trim() ? (
                  <p className="mt-2 line-clamp-2 text-[11px] text-text-secondary">
                    {tagline}
                  </p>
                ) : null}
                <div className="mt-4 space-y-1.5 text-[11px] text-text-muted">
                  <p>{modCount} mod{modCount === 1 ? "" : "s"}</p>
                  <p>{resourcePacks.length} resource pack{resourcePacks.length === 1 ? "" : "s"}</p>
                  <p>{datapacks.length} datapack{datapacks.length === 1 ? "" : "s"}</p>
                  <p>{shaders.length} shader{shaders.length === 1 ? "" : "s"}</p>
                </div>
                {(coverImage.preview || iconImage.preview) ? (
                  <div className="mt-4 overflow-hidden rounded-lg border border-white/8">
                    <img
                      src={coverImage.preview || iconImage.preview}
                      alt=""
                      className="h-20 w-full object-cover"
                    />
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
        <div className="build-editor-footer shrink-0 border-t border-white/8 pt-4">
          {footer}
        </div>
      </div>
    );
  }

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

      <div className="flex min-w-0 flex-col gap-4">
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
          <label className="flex items-center gap-2 text-[10px] text-text-muted">
            <input
              type="checkbox"
              checked={isPublicCatalog}
              onChange={(e) => setIsPublicCatalog(e.target.checked)}
              disabled={!isPublished || !canCatalog}
            />
            Share in public build catalog
          </label>
          {!canCatalog && (
            <p className="text-[9px] text-text-disabled">
              Only the guild owner or members with publish permission can share
              builds in the public catalog.
            </p>
          )}
          {!isPublished && isPublicCatalog && (
            <p className="text-[9px] text-state-warning">
              Build must be published before it can appear in the catalog.
            </p>
          )}
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-text-muted font-semibold">
              Keywords ({keywords.length}/13)
            </p>
            <div className="flex flex-wrap gap-1">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-md bg-white/6 border border-white/10 px-2 py-0.5 text-[9px] text-text-muted"
                >
                  {k}
                  <button
                    type="button"
                    onClick={() => setKeywords(keywords.filter((v) => v !== k))}
                    className="text-text-disabled hover:text-state-error cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={kwDraft}
                onChange={(e) => setKwDraft(e.target.value.slice(0, 13))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const tag = kwDraft.trim().toLowerCase();
                    if (tag && /^[a-z0-9_-]{1,13}$/.test(tag) && keywords.length < 13 && !keywords.includes(tag)) {
                      setKeywords([...keywords, tag]);
                      setKwDraft("");
                    }
                  }
                }}
                placeholder="Add keyword…"
                className="flex-1 rounded-md border border-border-subtle bg-black/25 px-2 py-1.5 text-[10px] text-text-primary outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const tag = kwDraft.trim().toLowerCase();
                  if (tag && /^[a-z0-9_-]{1,13}$/.test(tag) && keywords.length < 13 && !keywords.includes(tag)) {
                    setKeywords([...keywords, tag]);
                    setKwDraft("");
                  }
                }}
                className="rounded-md border border-white/12 px-2 py-1 text-[9px] text-text-secondary cursor-pointer"
              >
                Add
              </button>
            </div>
            <p className="text-[8px] text-text-disabled">
              Lowercase a-z, 0-9, _ or - only. 1–13 chars each.
            </p>
          </div>
          <p className="text-[10px] text-text-muted">
            Summary: {mods.filter((m) => !m.optional).length} required ·{" "}
            {mods.filter((m) => m.optional).length} optional ·{" "}
            {resourcePacks.length} packs · {datapacks.length} datapacks ·{" "}
            {shaders.length} shaders
          </p>
        </div>
      )}

      <div className="border-t border-border-subtle pt-4">{footer}</div>
      </div>
    </div>
  );
}
