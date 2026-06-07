"use client";

import { create } from "zustand";

type MapState = {
  selectedPinId: string | null;
  viewVersion: number;
  selectPin: (pinId: string) => void;
  resetView: () => void;
};

export const useMapStore = create<MapState>((set) => ({
  selectedPinId: null,
  viewVersion: 0,
  selectPin: (pinId) => set({ selectedPinId: pinId }),
  resetView: () => set((state) => ({ selectedPinId: null, viewVersion: state.viewVersion + 1 }))
}));
