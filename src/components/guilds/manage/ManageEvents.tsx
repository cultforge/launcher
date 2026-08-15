import { toast } from "sonner";
import { eventTypeLabel } from "../../../data/guilds";
import { useNow } from "../../../lib/clock";
import {
  compareTimedEvents,
  getEventPhase,
} from "../../../lib/timedEvents";
import { useGuildModalsStore } from "../../../stores/guildModals";
import { useGuildStore } from "../../../stores/guilds";

export function ManageEvents() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const events = useGuildStore((state) => state.events);
  const cancelEvent = useGuildStore((state) => state.cancelEvent);
  const open = useGuildModalsStore((state) => state.open);
  const now = useNow();
  const rows = events
    .filter((event) => event.guildId === guildId)
    .sort(compareTimedEvents);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            Events
          </h3>
          <p className="text-[10px] text-text-muted">
            Create, edit, or cancel guild events.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("event")}
          className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
        >
          Create event
        </button>
      </div>
      <div className="cf-panel overflow-hidden rounded-xl">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-text-muted">
            No events yet.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border-subtle text-[8px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Phase</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => {
                const phase = getEventPhase(event, now);
                return (
                  <tr
                    key={event.id}
                    className="border-b border-border-subtle/60 last:border-0"
                  >
                    <td className="px-3 py-2 text-[11px] text-text-primary">
                      {event.title}
                    </td>
                    <td className="px-3 py-2 text-[10px] capitalize text-text-secondary">
                      {eventTypeLabel(event)}
                    </td>
                    <td className="px-3 py-2 text-[10px] capitalize text-text-muted">
                      {phase}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => open("event", event.id)}
                        className="mr-2 text-[9px] text-primary-base cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void cancelEvent(guildId, event.id).then((result) => {
                            if (result.ok) toast.success(result.message);
                            else toast.error(result.message);
                          });
                        }}
                        className="text-[9px] text-state-error cursor-pointer"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
