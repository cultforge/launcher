import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GuildModalShell } from "../guilds/GuildModalShell";
import {
  guildFieldClass,
  guildHintClass,
  guildLabelClass,
  guildPrimaryBtnClass,
  guildSecondaryBtnClass,
  guildSectionClass,
  guildTextareaClass,
} from "../guilds/guildFormStyles";
import { useGuildModalsStore } from "../../stores/guildModals";
import { useGuildStore } from "../../stores/guilds";
import { useNavigationStore, type PrimaryTab } from "../../typlibs";
import {
  applyGuildBranding,
  checkGuildCreateEligibility,
  createGuild,
  type GuildCreateEligibility,
} from "../../lib/guildApi";
import { linkOAuthProvider, openOAuthUrl } from "../../lib/client";
import { logger } from "../../lib/logger";
import {
  BuildImageField,
  emptyBuildImageDraft,
  type BuildImageDraft,
} from "../guilds/manage/BuildImageField";

export function CreateGuildModal() {
  const open = useGuildModalsStore((s) => s.modal === "create");
  const close = useGuildModalsStore((s) => s.close);
  const hydrateMyGuilds = useGuildStore((s) => s.hydrateMyGuilds);
  const setActiveGuild = useGuildStore((s) => s.setActiveGuild);
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const setPrimaryTab = useNavigationStore((s) => s.setPrimaryTab);
  const setSideItem = useNavigationStore((s) => s.setSideItem);

  const [eligibility, setEligibility] =
    useState<GuildCreateEligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconDraft, setIconDraft] = useState<BuildImageDraft>(() =>
    emptyBuildImageDraft(),
  );
  const [bannerDraft, setBannerDraft] = useState<BuildImageDraft>(() =>
    emptyBuildImageDraft(),
  );
  const [creating, setCreating] = useState(false);
  const [linkingGithub, setLinkingGithub] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setIconDraft(emptyBuildImageDraft());
    setBannerDraft(emptyBuildImageDraft());
    setEligibility(null);
    setLoadingEligibility(true);
    void checkGuildCreateEligibility()
      .then((result) => setEligibility(result))
      .catch((err) => {
        const message =
          err instanceof Error
            ? err.message
            : "Could not check guild create eligibility.";
        logger.warn(`Guild create eligibility: ${message}`);
        toast.error(message);
        setEligibility({
          canCreate: false,
          hasGithub: false,
          alreadyOwnsGuild: false,
          message,
        });
      })
      .finally(() => setLoadingEligibility(false));
  }, [open]);

  const onLinkGithub = async () => {
    setLinkingGithub(true);
    try {
      const url = await linkOAuthProvider("github");
      await openOAuthUrl(url);
      toast.message("Continue in your browser", {
        description: "Link GitHub, then return here and retry Create guild.",
      });
      window.setTimeout(() => {
        void checkGuildCreateEligibility()
          .then(setEligibility)
          .catch(() => undefined);
      }, 2500);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start GitHub link",
      );
    } finally {
      setLinkingGithub(false);
    }
  };

  const onCreate = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      toast.error("Guild name must be at least 3 characters.");
      return;
    }
    if (!eligibility?.canCreate) {
      toast.error(
        eligibility?.message ||
          "You cannot create a guild yet. Link GitHub and make sure you do not already own one.",
      );
      return;
    }
    const iconUrl = iconDraft.upload
      ? undefined
      : iconDraft.url.trim() || undefined;
    const bannerUrl = bannerDraft.upload
      ? undefined
      : bannerDraft.url.trim() || undefined;
    if (iconUrl && !/^https?:\/\//i.test(iconUrl)) {
      toast.error("Icon URL must start with http:// or https://");
      return;
    }
    if (bannerUrl && !/^https?:\/\//i.test(bannerUrl)) {
      toast.error("Banner URL must start with http:// or https://");
      return;
    }
    setCreating(true);
    try {
      const created = await createGuild({
        name: trimmed,
        description: description.trim() || undefined,
        iconUrl,
        bannerUrl,
      });

      const iconUpload = iconDraft.upload;
      const bannerUpload = bannerDraft.upload;
      if (iconUpload || bannerUpload) {
        try {
          await applyGuildBranding(created.id, {
            icon: iconUpload
              ? { url: "", upload: iconUpload, clear: false }
              : undefined,
            banner: bannerUpload
              ? { url: "", upload: bannerUpload, clear: false }
              : undefined,
          });
        } catch (err) {
          toast.error(
            err instanceof Error
              ? `Guild created, but artwork upload failed: ${err.message}`
              : "Guild created, but artwork upload failed.",
          );
        }
      }

      await hydrateMyGuilds();
      setActiveGuild(created.id);
      setHubTab("Overview");
      setPrimaryTab("Guilds" as PrimaryTab);
      setSideItem("Guilds");
      toast.success(`${created.name} created`, {
        description: "You are the guild leader.",
      });
      close();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create guild",
      );
    } finally {
      setCreating(false);
    }
  };

  const canSubmit =
    !loadingEligibility &&
    !!eligibility?.canCreate &&
    name.trim().length >= 3 &&
    !creating;

  const fieldsDisabled = creating || (!!eligibility && !eligibility.canCreate);

  return (
    <GuildModalShell
      open={open}
      title="Create guild"
      subtitle="Start a home for your crew on CultForge. Requires a linked GitHub account."
      onClose={() => {
        if (!creating) close();
      }}
      confirmClose={() =>
        Boolean(name.trim() || iconDraft.preview || bannerDraft.preview)
      }
      confirmCloseMessage="Discard this guild draft and close?"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            disabled={creating}
            onClick={close}
            className={guildSecondaryBtnClass}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onCreate()}
            className={guildPrimaryBtnClass}
          >
            {creating ? "Creating…" : "Create guild"}
          </button>
        </div>
      }
    >
      {loadingEligibility ? (
        <p className="py-8 text-center text-[13px] text-text-muted">
          Checking eligibility…
        </p>
      ) : eligibility && !eligibility.canCreate ? (
        <div
          className={`${guildSectionClass} flex flex-col gap-3 border-state-warning/25 bg-state-warning/8`}
        >
          <p className={guildHintClass}>{eligibility.message}</p>
          {!eligibility.hasGithub ? (
            <button
              type="button"
              disabled={linkingGithub}
              onClick={() => void onLinkGithub()}
              className="self-start rounded-xl border border-primary-base/35 px-4 py-2 text-[12px] font-semibold text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50"
            >
              {linkingGithub ? "Opening…" : "Link GitHub"}
            </button>
          ) : null}
          {eligibility.alreadyOwnsGuild ? (
            <p className="text-[11px] text-text-muted">
              Leave or transfer leadership of your current guild before
              founding another.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-primary-base/20 bg-primary-base/8 px-4 py-3 text-[12px] text-text-secondary">
          {eligibility?.message || "You can create a guild."}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className={guildLabelClass}>Guild name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={fieldsDisabled}
          className={guildFieldClass}
          placeholder="The Neon Citadel"
          maxLength={100}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={guildLabelClass}>Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={fieldsDisabled}
          className={`${guildTextareaClass} min-h-24`}
          placeholder="What your guild is about (optional)"
          maxLength={400}
        />
      </label>

      {!fieldsDisabled ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <BuildImageField
            kind="icon"
            label="Guild icon"
            value={iconDraft}
            onChange={setIconDraft}
            stagedHint="Uploads right after the guild is created."
          />
          <BuildImageField
            kind="cover"
            label="Guild banner"
            value={bannerDraft}
            onChange={setBannerDraft}
            stagedHint="Uploads right after the guild is created."
            resolutionKind="banner"
          />
        </div>
      ) : null}
    </GuildModalShell>
  );
}
