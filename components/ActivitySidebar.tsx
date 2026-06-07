"use client";

import pins from "@/data/activities/osrs-pins.json";
import { useMapStore } from "@/lib/store/useMapStore";
import type { ActivityPin } from "@/lib/terrain/types";

const typedPins = pins as ActivityPin[];

export function ActivitySidebar() {
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const selectPin = useMapStore((state) => state.selectPin);
  const resetView = useMapStore((state) => state.resetView);
  const selectedPin = typedPins.find((pin) => pin.id === selectedPinId);

  return (
    <aside className="sidebar" aria-label="Activity details">
      <div className="sidebar-header">
        <div>
          <div className="type-badge">{selectedPin?.type ?? "Survey"}</div>
          <h2>{selectedPin?.label ?? "Eastern Gielinor"}</h2>
        </div>
        <button className="reset-button" type="button" onClick={resetView} aria-label="Reset view" title="Reset View">
          ↺
        </button>
      </div>

      <p>
        {selectedPin?.description ??
          "Select a marker to inspect a starter hub, then watch the camera fly to its world coordinates."}
      </p>

      {selectedPin ? (
        <div className="stat-grid">
          <div className="stat">
            <span>X</span>
            <strong>{selectedPin.x}</strong>
          </div>
          <div className="stat">
            <span>Y</span>
            <strong>{selectedPin.y}</strong>
          </div>
          <div className="stat">
            <span>Plane</span>
            <strong>{selectedPin.plane}</strong>
          </div>
        </div>
      ) : null}

      <section>
        <h3>Activity Pins</h3>
        <div className="pin-list">
          {typedPins.map((pin) => (
            <button
              className={`pin-button${pin.id === selectedPinId ? " is-active" : ""}`}
              key={pin.id}
              type="button"
              onClick={() => selectPin(pin.id)}
            >
              <strong>{pin.label}</strong>
              <span>{pin.type}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="empty-state">Mock terrain follows the final chunk schema, ready for cache-derived heights later.</p>
    </aside>
  );
}
