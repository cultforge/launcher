import type { PrimaryTab } from "../typlibs";
import { useNavigationStore } from "../typlibs";

/** Default side item when the Home header tab is selected (builds hub). */
export const HOME_BUILDS_SIDE = "Builds";

/** Home tab sub-pages routed through HomePage instead of BuildsPage. */
export const HOME_SUB_ROUTES = new Set([
  "Updates",
  "Feed",
  "Friends",
  "Discord",
  "Settings",
  "Downloads",
]);

export function isHomeBuildsView(
  primaryTab: PrimaryTab,
  sideItem: string,
): boolean {
  if (primaryTab === "Builds") return true;
  if (primaryTab !== "Home") return false;
  if (!sideItem || sideItem === "Home" || sideItem === HOME_BUILDS_SIDE) {
    return true;
  }
  return !HOME_SUB_ROUTES.has(sideItem);
}

export function homeBuildsSideItem(): string {
  return HOME_BUILDS_SIDE;
}

export function goHomeBuilds(): void {
  const nav = useNavigationStore.getState();
  nav.setPrimaryTab("Home");
  nav.setSideItem(HOME_BUILDS_SIDE);
}
