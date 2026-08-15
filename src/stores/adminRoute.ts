import { create } from "zustand";

type AdminRouteStore = {
  activeSection: string;
  detailId: string | null;
  setSection: (section: string) => void;
  setDetailId: (id: string | null) => void;
  reset: () => void;
};

export const useAdminRouteStore = create<AdminRouteStore>((set) => ({
  activeSection: "overview",
  detailId: null,
  setSection: (section) => set({ activeSection: section, detailId: null }),
  setDetailId: (detailId) => set({ detailId }),
  reset: () => set({ activeSection: "overview", detailId: null }),
}));
