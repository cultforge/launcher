import { toast } from "sonner";
import { logger } from "./logger";
import { syncAllManagedBuilds } from "./guildBuildSync";
import { useBuildStore } from "../stores/build";
import { useLibraryContentStore } from "../stores/libraryContent";
import { useUpdatesStore } from "../stores/updates";

let started = false;

/**
 * Boot pipeline: discover local + guild-managed builds, scan active content,
 * sync managed builds when online, then enrich with Modrinth metadata.
 */
export function startLocalContentPipeline(): void {
  if (started) return;
  started = true;

  void (async () => {
    try {
      await useBuildStore.getState().hydrate();

      const online = navigator.onLine;
      await syncAllManagedBuilds(online);

      const active = useBuildStore.getState().active();
      const scanRoot = active.location?.trim() || "";
      if (scanRoot) {
        await useLibraryContentStore.getState().scan(scanRoot);
        const content = useLibraryContentStore.getState();
        useBuildStore.getState().applyContentStats({
          mods: content.itemsOfKind("mod").length,
          worlds: content.itemsOfKind("world").length,
        });
      } else {
        useLibraryContentStore.setState({
          items: [],
          scanned: true,
          scanning: false,
          root: "",
        });
      }

      if (!online) {
        logger.warn("Offline: using local scan + cached metadata only");
      }
      await useLibraryContentStore.getState().enrich(online);
      await useUpdatesStore.getState().check(online);
      const launcherUpdate = useUpdatesStore
        .getState()
        .items.find(
          (u) => u.id.startsWith("launcher:") && u.status === "pending",
        );
      if (launcherUpdate) {
        toast.message("Launcher update available", {
          description: `${launcherUpdate.from} → ${launcherUpdate.to}. Open Updates to install.`,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`Local content pipeline failed: ${message}`);
      toast.message("Local scan failed", {
        description: message,
      });
    }
  })();
}
