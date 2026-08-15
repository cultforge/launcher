import { toast } from "sonner";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useGuildStore } from "../../../stores/guilds";

export function ManageServers() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const servers = useGuildStore((state) => state.servers);
  const deleteServer = useGuildStore((state) => state.deleteServer);
  const open = useGuildModalsStore((state) => state.open);
  const rows = servers.filter((server) => server.guildId === guildId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            Servers
          </h3>
          <p className="text-[10px] text-text-muted">
            Listings persist on CultForge. Required build is checked at join.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("server")}
          className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
        >
          Add server
        </button>
      </div>
      <div className="cf-panel overflow-hidden rounded-xl">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-text-muted">
            No servers configured.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border-subtle text-[8px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((server) => (
                <tr
                  key={server.id}
                  className="border-b border-border-subtle/60 last:border-0"
                >
                  <td className="px-3 py-2 text-[11px] text-text-primary">
                    {server.name}
                    {server.tags.length > 0 && (
                      <div className="mt-0.5 text-[8px] text-text-muted">
                        {server.tags.join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-text-secondary">
                    {server.address}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-text-muted">
                    {server.region}
                  </td>
                  <td className="px-3 py-2 text-[10px] capitalize text-text-secondary">
                    {server.status}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => open("server", server.id)}
                      className="mr-2 text-[9px] text-primary-base cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteServer(guildId, server.id).then((result) => {
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
