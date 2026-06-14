"use client";

import { create } from "zustand";
import type { Activity, ActivityType } from "@/lib/activities/types";
import type { PlayerLookup } from "@/lib/osrs/player";

export type MapFocusRequest = {
  x: number;
  y: number;
  label?: string;
  version: number;
};

type MapState = {
  selectedPinId: string | null;
  selectedActivityId: string | null;
  activeLayer: ActivityType;
  focusRequest: MapFocusRequest | null;
  viewVersion: number;
  player: PlayerLookup | null;
  selectPin: (pinId: string) => void;
  selectActivity: (activityId: string) => void;
  focusActivity: (activity: Activity) => void;
  focusLocation: (location: { x: number; y: number; label?: string }) => void;
  setActiveLayer: (layer: ActivityType) => void;
  resetView: () => void;
  setPlayer: (player: PlayerLookup | null) => void;
};

export const useMapStore = create<MapState>((set) => ({
  selectedPinId: null,
  selectedActivityId: null,
  activeLayer: "quest",
  focusRequest: null,
  viewVersion: 0,
  player: null,
  selectPin: (pinId) => set({ selectedPinId: pinId, selectedActivityId: pinId }),
  selectActivity: (activityId) => set({ selectedPinId: activityId, selectedActivityId: activityId }),
  focusActivity: (activity) =>
    set((state) => ({
      activeLayer: activity.type,
      selectedPinId: activity.id,
      selectedActivityId: activity.id,
      focusRequest: {
        x: activity.location.x,
        y: activity.location.y,
        label: activity.title,
        version: state.focusRequest ? state.focusRequest.version + 1 : 1
      }
    })),
  focusLocation: (location) =>
    set((state) => ({
      selectedPinId: null,
      selectedActivityId: null,
      focusRequest: {
        x: location.x,
        y: location.y,
        label: location.label,
        version: state.focusRequest ? state.focusRequest.version + 1 : 1
      }
    })),
  setActiveLayer: (activeLayer) => set({ activeLayer, selectedPinId: null, selectedActivityId: null, focusRequest: null }),
  resetView: () =>
    set((state) => ({ selectedPinId: null, selectedActivityId: null, focusRequest: null, viewVersion: state.viewVersion + 1 })),
  setPlayer: (player) => set({ player, selectedPinId: null, selectedActivityId: null, focusRequest: null })
}));
