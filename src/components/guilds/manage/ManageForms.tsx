import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createGuildForm,
  fetchGuildForms,
  submitGuildForm,
  type GuildForm,
} from "../../../lib/guildFormsApi";
import { useGuildStore } from "../../../stores/guilds";

export function ManageForms() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const [forms, setForms] = useState<GuildForm[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!guildId) return;
    try {
      setForms(await fetchGuildForms(guildId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load forms");
    }
  };

  useEffect(() => {
    void reload();
  }, [guildId]);

  const create = async () => {
    if (!guildId || !title.trim()) return;
    setBusy(true);
    try {
      await createGuildForm(guildId, {
        title: title.trim(),
        description: description.trim() || undefined,
        fields: [{ id: "answer", label: "Response", type: "text" }],
      });
      setTitle("");
      setDescription("");
      toast.success("Form created");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-sora text-[14px] font-bold text-text-primary">
          Forms
        </h3>
        <p className="text-[10px] text-text-muted">
          Guild application and intake forms (CRUD + submit).
        </p>
      </div>

      <section className="cf-panel rounded-xl p-4 flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Form title"
          className="rounded-lg border border-border-subtle bg-black/25 px-3 py-2 text-[11px] text-text-primary outline-none"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="rounded-lg border border-border-subtle bg-black/25 px-3 py-2 text-[11px] text-text-primary outline-none"
        />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void create()}
          className="cf-btn-primary w-fit rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
        >
          Create form
        </button>
      </section>

      <ul className="flex flex-col gap-2">
        {forms.map((form) => (
          <li key={form.id} className="cf-panel rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-semibold text-text-primary">
                  {form.title}
                </div>
                <div className="text-[10px] text-text-muted">
                  {form.submissionCount} submissions ·{" "}
                  {form.isOpen ? "Open" : "Closed"}
                </div>
              </div>
              {form.isOpen && !form.mySubmissionId && (
                <button
                  type="button"
                  onClick={() => {
                    void submitGuildForm(guildId, form.id, {
                      answer: "Interested",
                    })
                      .then(() => {
                        toast.success("Submitted");
                        return reload();
                      })
                      .catch((err) =>
                        toast.error(
                          err instanceof Error ? err.message : "Submit failed",
                        ),
                      );
                  }}
                  className="cf-btn-primary rounded-lg px-2.5 py-1.5 text-[10px] font-semibold cursor-pointer"
                >
                  Quick submit
                </button>
              )}
            </div>
            {form.description && (
              <p className="text-[11px] text-text-secondary">{form.description}</p>
            )}
          </li>
        ))}
        {forms.length === 0 && (
          <li className="text-[11px] text-text-muted px-1">No forms yet.</li>
        )}
      </ul>
    </div>
  );
}
