"use client";

import { create } from "zustand";
import type { ActivityType } from "@/lib/activities/types";
import type { PlayerLookup } from "@/lib/osrs/player";

type MapState = {
  selectedPinId: string | null;
  selectedActivityId: string | null;
  activeLayer: ActivityType;
  viewVersion: number;
  player: PlayerLookup | null;
  selectPin: (pinId: string) => void;
  selectActivity: (activityId: string) => void;
  setActiveLayer: (layer: ActivityType) => void;
  resetView: () => void;
  setPlayer: (player: PlayerLookup | null) => void;
};

export const useMapStore = create<MapState>((set) => ({
  selectedPinId: null,
  selectedActivityId: null,
  activeLayer: "quest",
  viewVersion: 0,
  player: null,
  selectPin: (pinId) => set({ selectedPinId: pinId, selectedActivityId: pinId }),
  selectActivity: (activityId) => set({ selectedPinId: activityId, selectedActivityId: activityId }),
  setActiveLayer: (activeLayer) => set({ activeLayer, selectedPinId: null, selectedActivityId: null }),
  resetView: () => set((state) => ({ selectedPinId: null, selectedActivityId: null, viewVersion: state.viewVersion + 1 })),
  setPlayer: (player) => set({ player, selectedPinId: null, selectedActivityId: null })
}));
