import { useEffect, useState } from "react";
import { toast } from "sonner";
import { discordSourceForGuild } from "../../../data/guilds";
import { hasDiscordSource } from "../../../lib/discordWidget";
import { useGuildStore } from "../../../stores/guilds";

export function ManageDiscord() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const discordOverrides = useGuildStore((state) => state.discordOverrides);
  const setGuildDiscord = useGuildStore((state) => state.setGuildDiscord);
  const resolved = discordSourceForGuild(guildId, discordOverrides);
  const [draft, setDraft] = useState(resolved ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(resolved ?? "");
  }, [guildId, resolved]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      const result = await setGuildDiscord(guildId, value);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-sora text-[14px] font-bold text-text-primary">
          Discord
        </h3>
        <p className="text-[10px] text-text-muted">
          Saved on the CultForge guild manifest so every member sees the same
          widget. Guild ID, widget URL, or widget.json URL.
        </p>
      </div>
      <section className="cf-panel rounded-xl p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[9px] uppercase tracking-wider text-text-muted">
            Widget source
          </span>
          <span
            className={`text-[9px] ${
              hasDiscordSource(draft) ? "text-primary-base" : "text-text-muted"
            }`}
          >
            {hasDiscordSource(draft) ? "Parsable" : "Not set"}
          </span>
        </div>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-black/25 px-3 py-2 text-[11px] text-text-primary outline-none focus:border-primary-base/45"
          placeholder="123456789012345678 or https://discord.com/widget?id=…"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(draft)}
            className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save Discord"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft("");
              void save("");
            }}
            className="rounded-lg border border-border-subtle px-3 py-2 text-[10px] text-text-secondary cursor-pointer disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}
