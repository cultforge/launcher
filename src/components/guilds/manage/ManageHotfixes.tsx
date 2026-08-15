import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchGuildHotfixes,
  publishGuildHotfix,
  type HotUpdate,
} from "../../../lib/guildHotUpdatesApi";
import { useGuildStore } from "../../../stores/guilds";

export function ManageHotfixes() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const [items, setItems] = useState<HotUpdate[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!guildId) return;
    try {
      setItems(await fetchGuildHotfixes(guildId));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load hotfixes",
      );
    }
  };

  useEffect(() => {
    void reload();
  }, [guildId]);

  const publish = async () => {
    if (!guildId || !title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await publishGuildHotfix(guildId, {
        title: title.trim(),
        body: body.trim(),
      });
      setTitle("");
      setBody("");
      toast.success("Hotfix published");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-sora text-[14px] font-bold text-text-primary">
          Hotfixes
        </h3>
        <p className="text-[10px] text-text-muted">
          Guild-scoped hot updates shown alongside launcher updates.
        </p>
      </div>

      <section className="cf-panel rounded-xl p-4 flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-lg border border-border-subtle bg-black/25 px-3 py-2 text-[11px] text-text-primary outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body (markdown or plain)"
          rows={4}
          className="rounded-lg border border-border-subtle bg-black/25 px-3 py-2 text-[11px] text-text-primary outline-none"
        />
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void publish()}
          className="cf-btn-primary w-fit rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
        >
          Publish hotfix
        </button>
      </section>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="cf-panel rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-text-primary">
                {item.title}
              </div>
              <span className="text-[9px] uppercase text-text-muted">
                {item.severity} · {item.channel}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-text-secondary line-clamp-3">
              {item.body}
            </p>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-[11px] text-text-muted px-1">No hotfixes yet.</li>
        )}
      </ul>
    </div>
  );
}
