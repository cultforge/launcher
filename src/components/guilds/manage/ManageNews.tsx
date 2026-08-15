import { toast } from "sonner";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useGuildStore } from "../../../stores/guilds";

export function ManageNews() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const news = useGuildStore((state) => state.news);
  const togglePinned = useGuildStore((state) => state.togglePinnedNews);
  const deleteNews = useGuildStore((state) => state.deleteNews);
  const open = useGuildModalsStore((state) => state.open);
  const rows = news.filter((item) => item.guildId === guildId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            News
          </h3>
          <p className="text-[10px] text-text-muted">
            Post, pin, edit, or delete announcements.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("announcement")}
          className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
        >
          Post announcement
        </button>
      </div>
      <div className="cf-panel overflow-hidden rounded-xl">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-text-muted">
            No announcements yet.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border-subtle text-[8px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Pinned</th>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border-subtle/60 last:border-0"
                >
                  <td className="px-3 py-2 text-[11px] text-text-primary">
                    {item.title}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-text-secondary">
                    {item.pinned ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-text-muted">
                    {item.when}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        void togglePinned(guildId, item.id).then((result) => {
                          if (result.ok) toast.success(result.message);
                          else toast.error(result.message);
                        });
                      }}
                      className="mr-2 text-[9px] text-text-secondary cursor-pointer"
                    >
                      {item.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => open("announcement", item.id)}
                      className="mr-2 text-[9px] text-primary-base cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteNews(guildId, item.id).then((result) => {
                          if (result.ok) toast.success(result.message);
                          else toast.error(result.message);
                        });
                      }}
                      className="text-[9px] text-state-error cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
