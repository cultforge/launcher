import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getGuild } from "../../../data/guilds";
import { useGuildStore } from "../../../stores/guilds";
import { EntityImage } from "../../EntityImage";
import { GuildIcon } from "../../GuildIcon";
import { cn } from "../../../lib/cn";
import type { GuildBrandingDraft } from "../../../lib/guildApi";
import {
  BuildImageField,
  emptyBuildImageDraft,
  type BuildImageDraft,
} from "./BuildImageField";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function draftToBranding(
  draft: BuildImageDraft,
  baselineUrl: string,
): GuildBrandingDraft | undefined {
  if (draft.upload?.image_base64 || draft.upload?.image_url) {
    return { url: "", upload: draft.upload, clear: false };
  }
  const url = draft.url.trim();
  if (url && isHttpUrl(url) && url !== baselineUrl) {
    return { url, upload: null, clear: false };
  }
  if (!url && !draft.upload && !draft.preview && baselineUrl) {
    return { url: "", upload: null, clear: true };
  }
  // Unchanged existing URL kept in the field — no PATCH/upload.
  return undefined;
}

export function ManageBranding() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const revision = useGuildStore((state) => state.guildCatalogRevision);
  const setGuildBranding = useGuildStore((state) => state.setGuildBranding);
  const guild = getGuild(guildId);

  const baselineIcon =
    typeof guild?.icon === "string" && isHttpUrl(guild.icon) ? guild.icon : "";
  const baselineBanner =
    typeof guild?.banner === "string" && isHttpUrl(guild.banner)
      ? guild.banner
      : "";

  const [iconDraft, setIconDraft] = useState(() =>
    emptyBuildImageDraft(baselineIcon),
  );
  const [bannerDraft, setBannerDraft] = useState(() =>
    emptyBuildImageDraft(baselineBanner),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIconDraft(emptyBuildImageDraft(baselineIcon));
    setBannerDraft(emptyBuildImageDraft(baselineBanner));
  }, [guildId, revision, baselineIcon, baselineBanner]);

  if (!guild) {
    return (
      <div className="cf-panel rounded-xl p-4 text-[12px] text-text-muted">
        No guild selected.
      </div>
    );
  }

  const save = async () => {
    const icon = draftToBranding(iconDraft, baselineIcon);
    const banner = draftToBranding(bannerDraft, baselineBanner);
    if (!icon && !banner) {
      toast.message("No branding changes to save.");
      return;
    }
    setBusy(true);
    try {
      const result = await setGuildBranding(guildId, { icon, banner });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setBusy(false);
    }
  };

  const previewIcon =
    iconDraft.preview ||
    (iconDraft.url && isHttpUrl(iconDraft.url) ? iconDraft.url : null) ||
    guild.icon ||
    null;
  const previewBanner =
    bannerDraft.preview ||
    (bannerDraft.url && isHttpUrl(bannerDraft.url)
      ? bannerDraft.url
      : null) ||
    guild.banner;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-sora text-[14px] font-bold text-text-primary">
          Branding
        </h3>
        <p className="text-[10px] text-text-muted">
          Upload a PNG/JPEG/WebP or paste an image URL. Same flow as guild build
          artwork — files POST to CultForge as base64.
        </p>
      </div>

      <section className="cf-panel overflow-hidden rounded-xl">
        <div className="relative h-28 w-full">
          <EntityImage
            kind="guild"
            entityId={guild.id}
            source={previewBanner}
            alt={`${guild.name} banner preview`}
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-3 left-3 flex items-end gap-3">
            <GuildIcon
              src={previewIcon}
              name={guild.name}
              className={cn(
                "h-14 w-14 rounded-xl border border-white/20 bg-linear-to-br text-bg-app text-[14px]",
                guild.accent,
              )}
            />
            <div className="pb-0.5">
              <div className="text-[12px] font-semibold text-white">
                {guild.name}
              </div>
              <div className="text-[9px] text-white/70">Live preview</div>
            </div>
          </div>
        </div>
      </section>

      <section className="cf-panel rounded-xl p-4 flex flex-col gap-3">
        <BuildImageField
          kind="icon"
          label="Guild icon"
          value={iconDraft}
          onChange={setIconDraft}
          existingHint={baselineIcon || null}
          stagedHint="File staged — uploads when you save branding."
        />
        <BuildImageField
          kind="cover"
          label="Guild banner"
          value={bannerDraft}
          onChange={setBannerDraft}
          existingHint={baselineBanner || null}
          stagedHint="File staged — uploads when you save branding."
          resolutionKind="banner"
        />

        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save branding"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setIconDraft(emptyBuildImageDraft());
              setBannerDraft(emptyBuildImageDraft());
            }}
            className="rounded-lg border border-border-subtle px-3 py-2 text-[10px] text-text-secondary cursor-pointer disabled:opacity-50"
          >
            Clear fields
          </button>
        </div>
      </section>
    </div>
  );
}
