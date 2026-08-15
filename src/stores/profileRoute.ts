import { create } from "zustand";
import { useNavigationStore, type PrimaryTab } from "../typlibs";

export type PlayerProfileTab =
  | "overview"
  | "stats"
  | "rankings"
  | "activity";

export type ProfileTarget =
  | { kind: "self" }
  | { kind: "friend"; id: string };

type ProfileOrigin = {
  primaryTab: PrimaryTab;
  sideItem: string;
};

type ProfileRouteStore = {
  target: ProfileTarget | null;
  profileTab: PlayerProfileTab;
  origin: ProfileOrigin | null;
  openSelf: () => void;
  openFriend: (id: string) => void;
  closeProfile: () => void;
  setProfileTab: (tab: PlayerProfileTab) => void;
};

function currentOrigin(): ProfileOrigin {
  const navigation = useNavigationStore.getState();
  return {
    primaryTab: navigation.primaryTab,
    sideItem: navigation.sideItem,
  };
}

export const useProfileRouteStore = create<ProfileRouteStore>((set) => ({
  target: null,
  profileTab: "overview",
  origin: null,
  openSelf: () =>
    set({
      target: { kind: "self" },
      profileTab: "overview",
      origin: currentOrigin(),
    }),
  openFriend: (id) =>
    set({
      target: { kind: "friend", id },
      profileTab: "overview",
      origin: currentOrigin(),
    }),
  closeProfile: () =>
    set({ target: null, profileTab: "overview", origin: null }),
  setProfileTab: (profileTab) => set({ profileTab }),
}));
