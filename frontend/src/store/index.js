import { create } from 'zustand';

export const useRoomStore = create((set, get) => ({
    status: 'initializing', // initializing, waiting, connecting, connected, failed, cancelled
    error: null,
    joinCode: '',
    shareUrl: '',
    password: '',          // BUG-05: never stored in URL — kept in memory only
    isInitiator: false,
    peerConn: null,
    signaling: null,
    relayOnly: false,
    expiryTime: 0, // Time remaining in seconds

    setStatus: (status) => set({ status }),
    setError: (error) => set({ error }),
    setRoomInfo: (code, url) => set({ joinCode: code, shareUrl: url }),
    setPassword: (password) => set({ password }),  // BUG-05
    setPeerConn: (peerConn) => set({ peerConn }),
    setSignaling: (signaling) => set({ signaling }),
    setRelayOnly: (relayOnly) => set({ relayOnly }),
    setExpiryTime: (time) => set({ expiryTime: time }),

    reset: () => set({
        status: 'initializing',
        error: null,
        joinCode: '',
        shareUrl: '',
        password: '',   // BUG-05: clear password on room exit
        peerConn: null,
        signaling: null,
        expiryTime: 0
    })
}));

// We separate activeTransfers so UI updates on chunks don't cause the whole room to re-render
export const useTransferStore = create((set, get) => ({
    transfers: {}, // Map of transferId -> state
    globalStats: {
        totalSent: 0,
        totalReceived: 0,
        uploadSpeed: 0,
        downloadSpeed: 0
    },

    addTransfer: (id, transferData) => set((state) => ({
        transfers: { ...state.transfers, [id]: transferData }
    })),

    updateTransfer: (id, updates) => set((state) => {
        if (!state.transfers[id]) return state;
        return {
            transfers: {
                ...state.transfers,
                [id]: { ...state.transfers[id], ...updates }
            }
        };
    }),

    removeTransfer: (id) => set((state) => {
        const newTransfers = { ...state.transfers };
        delete newTransfers[id];
        return { transfers: newTransfers };
    }),

    updateGlobalStats: (stats) => set({ globalStats: stats }),

    reset: () => set({ transfers: {}, globalStats: { totalSent: 0, totalReceived: 0, uploadSpeed: 0, downloadSpeed: 0 } })
}));
