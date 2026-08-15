import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ModalShell } from "./ModalShell";
import { useGuildModalsStore } from "../../stores/guildModals";
import { useGuildStore } from "../../stores/guilds";
import { useNavigationStore, type PrimaryTab } from "../../typlibs";
import {
  checkGuildCreateEligibility,
  createGuild,
  type GuildCreateEligibility,
} from "../../lib/guildApi";
import {
  linkOAuthProvider,
  openOAuthUrl,
} from "../../lib/client";
import { logger } from "../../lib/logger";

const fieldClass =
  "w-full rounded-lg border border-border-subtle bg-black/25 px-3 py-2.5 text-[12px] text-text-primary outline-none focus:border-primary-base/45";

const labelClass =
  "text-[10px] font-semibold uppercase tracking-wider text-text-muted";

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
  const [creating, setCreating] = useState(false);
  const [linkingGithub, setLinkingGithub] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
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
    setCreating(true);
    try {
      const created = await createGuild({
        name: trimmed,
        description: description.trim() || undefined,
      });
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

  return (
    <ModalShell
      open={open}
      title="Create guild"
      onClose={creating ? () => undefined : close}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={creating}
            onClick={close}
            className="rounded-lg border border-white/12 px-3 py-2 text-[11px] text-text-secondary cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onCreate()}
            className="cf-btn-primary rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create guild"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-text-muted">
          Found a guild on CultForge. Requires a linked GitHub account, and you
          cannot already own or co-admin another guild.
        </p>

        {loadingEligibility ? (
          <p className="text-[12px] text-text-muted py-4 text-center">
            Checking eligibility…
          </p>
        ) : eligibility && !eligibility.canCreate ? (
          <div className="rounded-lg border border-state-warning/25 bg-state-warning/8 px-3 py-3 flex flex-col gap-2">
            <p className="text-[12px] text-text-secondary">
              {eligibility.message}
            </p>
            {!eligibility.hasGithub ? (
              <button
                type="button"
                disabled={linkingGithub}
                onClick={() => void onLinkGithub()}
                className="self-start rounded-lg border border-primary-base/35 px-3 py-1.5 text-[11px] font-semibold text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50"
              >
                {linkingGithub ? "Opening…" : "Link GitHub"}
              </button>
            ) : null}
            {eligibility.alreadyOwnsGuild ? (
              <p className="text-[10px] text-text-muted">
                Leave or transfer leadership of your current guild before
                founding another.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-primary-base/20 bg-primary-base/8 px-3 py-2 text-[11px] text-text-secondary">
            {eligibility?.message || "You can create a guild."}
          </div>
        )}

        <label className={labelClass}>Guild name</label>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={creating || (!!eligibility && !eligibility.canCreate)}
          className={fieldClass}
          placeholder="The Neon Citadel"
          maxLength={100}
        />

        <label className={labelClass}>Description (optional)</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={creating || (!!eligibility && !eligibility.canCreate)}
          className={`${fieldClass} min-h-20 resize-y`}
          placeholder="What your guild is about"
          maxLength={400}
        />
      </div>
    </ModalShell>
  );
}
