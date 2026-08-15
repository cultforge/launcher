import { useGuildStore } from "../../../../stores/guilds";
import { EntityImage } from "../../../EntityImage";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";

function ServersPage() {
  const servers = useGuildStore((s) => s.servers);
  const featured = servers[0];
  const rest = servers.slice(1);

  if (!featured) {
    return (
      <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
        <div className="cf-panel rounded-xl flex items-center justify-center min-h-50 text-[13px] text-text-muted">
          No servers listed yet.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-4">
      <section className="relative min-h-65 overflow-hidden rounded-xl border border-border-subtle">
        <EntityImage
          kind="server"
          entityId={featured.id}
          source={featured.thumbnail}
          alt={`${featured.name} server landscape`}
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-linear-to-r from-bg-app via-bg-app/82 to-bg-app/25" />
        <div className="relative z-10 p-6">
          <span className="text-[10px] uppercase tracking-widest text-primary-base font-semibold">
            Featured server
          </span>
          <h2 className="font-sora text-2xl font-bold text-text-primary mt-1">
            {featured.name}
          </h2>
          <p className="text-sm text-text-secondary mt-2 max-w-lg">
            {featured.description}
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-state-success" />
              {featured.playersOnline} / {featured.playersMax} online
            </span>
            <span>{featured.address}</span>
            <span>~{featured.pingMs} ms</span>
            <span>{featured.loader}</span>
          </div>
          <button
            type="button"
            className="cf-btn-primary mt-5 flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold cursor-pointer"
          >
            <Icon icon={AppIcons.Servers} size={16} />
            View requirements
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rest.map((server) => (
          <article
            key={server.id}
            className="cf-panel group overflow-hidden rounded-xl"
          >
            <EntityImage
              kind="server"
              entityId={server.id}
              source={server.thumbnail}
              alt={`${server.name} server thumbnail`}
              className="aspect-16/7 w-full border-b border-border-subtle transition-transform duration-300 group-hover:scale-[1.015]"
            />
            <div className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">
                  {server.name}
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted">
                  {server.playersOnline}/{server.playersMax} · {server.pingMs} ms ·{" "}
                  {server.version}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 text-[10px] font-semibold text-primary-base hover:underline cursor-pointer"
              >
                Details
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default ServersPage;
