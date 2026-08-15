import { create } from "zustand";
import type { FriendStatus } from "../data/friends";

type FriendsStore = {
  query: string;
  statusFilter: "all" | FriendStatus;
  setQuery: (query: string) => void;
  setStatusFilter: (filter: "all" | FriendStatus) => void;
};

export const useFriendsStore = create<FriendsStore>((set) => ({
  query: "",
  statusFilter: "all",
  setQuery: (query) => set({ query }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}));
