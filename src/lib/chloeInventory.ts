import { getClientOrigin, sidecarFetch } from "./client";
import { logger } from "./logger";

let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;

/** Debounced push of local builds/mods into Chloe launcher-state memory. */
export function scheduleChloeInventorySync(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushChloeInventory();
  }, 800);
}

export async function pushChloeInventory(): Promise<void> {
  if (inflight) {
    scheduleChloeInventorySync();
    return;
  }
  inflight = true;
  try {
    const [{ useBuildStore }, { useLibraryContentStore }] = await Promise.all([
      import("../stores/build"),
      import("../stores/libraryContent"),
    ]);
    const { builds, activeId } = useBuildStore.getState();
    const items = useLibraryContentStore.getState().items;
    const mods = items
      .filter((item) => item.kind === "mod")
      .map((item) => String(item.slug || item.name || "").trim())
      .filter(Boolean);
    const installed_builds = builds.map((build) => ({
      id: build.id,
      name: build.name,
      loader: build.loader,
      mc: build.mc,
      active: build.id === activeId,
      mods: build.id === activeId ? mods : [],
    }));
    const origin = await getClientOrigin();
    const res = await sidecarFetch(`${origin}/chloe/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installed_builds,
        installed_mods: mods,
      }),
    });
    if (!res.ok) {
      logger.debug(`Chloe inventory sync http=${res.status}`);
    }
  } catch (err) {
    logger.debug(
      `Chloe inventory sync skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    inflight = false;
  }
}
