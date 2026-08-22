import { create } from "zustand";
import { isAdminViewId, type AdminViewId } from "../lib/adminNav";

type AdminRouteStore = {
  activeSection: AdminViewId;
  detailId: string | null;
  streamOpen: boolean;
  setSection: (section: string) => void;
  setDetailId: (id: string | null) => void;
  setStreamOpen: (open: boolean) => void;
  reset: () => void;
};

export const useAdminRouteStore = create<AdminRouteStore>((set) => ({
  activeSection: "overview",
  detailId: null,
  streamOpen: false,
  setSection: (section) =>
    set({
      activeSection: isAdminViewId(section) ? section : "overview",
      detailId: null,
    }),
  setDetailId: (detailId) => set({ detailId }),
  setStreamOpen: (streamOpen) => set({ streamOpen }),
  reset: () =>
    set({ activeSection: "overview", detailId: null, streamOpen: false }),
}));
