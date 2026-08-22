import { create } from "zustand";

import { toast } from "sonner";

import { useNavigationStore } from "../typlibs";



type AgentControlStore = {

  selectedNodeId: string | null;

  selectedLocalServerId: string | null;

  pendingConnectCode: string | null;

  selectNode: (nodeId: string | null, localServerId?: string | null) => void;

  goToAgents: (nodeId?: string, localServerId?: string | null) => void;

  openAgentLinkHelp: (code?: string) => void;

  clearPendingConnectCode: () => void;

};



function navigateToMyPcs() {

  const nav = useNavigationStore.getState();

  nav.setPrimaryTab("Servers");

  nav.setSideItem("My PCs");

}



export const useAgentControlStore = create<AgentControlStore>((set) => ({

  selectedNodeId: null,

  selectedLocalServerId: null,

  pendingConnectCode: null,

  selectNode: (nodeId, localServerId) =>

    set({

      selectedNodeId: nodeId,

      selectedLocalServerId: localServerId ?? null,

    }),

  goToAgents: (nodeId, localServerId) => {

    navigateToMyPcs();

    set({

      selectedNodeId: nodeId ?? null,

      selectedLocalServerId: localServerId ?? null,

    });

  },

  openAgentLinkHelp: (code) => {

    navigateToMyPcs();

    set({

      pendingConnectCode: code?.trim() || null,

      selectedNodeId: null,

      selectedLocalServerId: null,

    });

    if (code?.trim()) {

      toast.message("Connect code from link", {

        description: "Guild PCs use register — see guild settings to generate a code.",

      });

    }

  },

  clearPendingConnectCode: () => set({ pendingConnectCode: null }),

}));

