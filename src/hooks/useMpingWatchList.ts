import { useEffect, useState } from "react";
import {
  applyMpingToServerStats,
  formatMpingLabel,
  liveOnlineFromMping,
  queryMpingStatus,
  syncMpingWatchList,
  type MpingStatus,
} from "../lib/mping";

export type MpingLiveEntry = {
  label: string;
  online: boolean | null;
  stats: { playersOnline: number; playersMax: number; pingMs: number } | null;
  raw: MpingStatus | null;
};

/**
 * Keep ctfgbroker watch list in sync and poll live stats for host:port addresses.
 */
export function useMpingWatchList(
  addresses: string[],
  pollMs = 3000,
): Record<string, MpingLiveEntry> {
  const [byAddress, setByAddress] = useState<Record<string, MpingLiveEntry>>(
    {},
  );
  const key = [...new Set(addresses.filter(Boolean))].sort().join("|");

  useEffect(() => {
    if (!key) {
      setByAddress({});
      return;
    }
    const list = key.split("|").filter(Boolean);
    let cancelled = false;

    const tick = async () => {
      try {
        await syncMpingWatchList(list);
      } catch {
        /* broker optional in web dev */
      }
      const next: Record<string, MpingLiveEntry> = {};
      await Promise.all(
        list.map(async (addr) => {
          const status = await queryMpingStatus(addr);
          next[addr] = {
            label: formatMpingLabel(status),
            online: liveOnlineFromMping(status),
            stats: applyMpingToServerStats(status),
            raw: status,
          };
        }),
      );
      if (!cancelled) setByAddress(next);
    };

    void tick();
    const id = window.setInterval(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key, pollMs]);

  return byAddress;
}
