"use client";

import { ACTIVITY_LAYERS } from "@/lib/activities/activityModel";
import { useMapStore } from "@/lib/store/useMapStore";

export function ActivityLayerTabs() {
  const activeLayer = useMapStore((state) => state.activeLayer);
  const setActiveLayer = useMapStore((state) => state.setActiveLayer);

  return (
    <nav className="activity-tabs" aria-label="Activity layers">
      {ACTIVITY_LAYERS.map((layer) => (
        <button
          className={layer.type === activeLayer ? "is-active" : ""}
          key={layer.type}
          type="button"
          onClick={() => setActiveLayer(layer.type)}
        >
          {layer.label}
        </button>
      ))}
    </nav>
  );
}
