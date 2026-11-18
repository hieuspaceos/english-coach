import { create } from 'zustand';

interface CoachState {
  apiKey: string | null;
  setApiKey: (k: string | null) => void;
  coins: number;
  setCoins: (n: number) => void;
  addCoins: (n: number) => void;
}

export const useCoachStore = create<CoachState>((set) => ({
  apiKey: null,
  setApiKey: (apiKey) => set({ apiKey }),
  coins: 0,
  setCoins: (coins) => set({ coins }),
  addCoins: (n) => set((s) => ({ coins: s.coins + n })),
}));
