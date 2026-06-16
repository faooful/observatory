"use client";

import { useRef } from "react";
import type { PointerEvent } from "react";
import { publicPath } from "@/lib/publicPath";
import { useMapStore } from "@/lib/store/useMapStore";

const DRAG_ROTATION_SENSITIVITY = 0.012;
const CLICK_ROTATION_STEP = Math.PI / 4;

export function MapCompassControl() {
  const compassAngle = useMapStore((state) => state.compassAngle);
  const rotateView = useMapStore((state) => state.rotateView);
  const dragStartX = useRef(0);
  const lastPointerX = useRef(0);
  const dragDistance = useRef(0);
  const draggingPointerId = useRef<number | null>(null);

  const applyRotation = (deltaRadians: number) => {
    rotateView(deltaRadians);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    draggingPointerId.current = event.pointerId;
    dragStartX.current = event.clientX;
    lastPointerX.current = event.clientX;
    dragDistance.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (draggingPointerId.current !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - lastPointerX.current;
    lastPointerX.current = event.clientX;
    dragDistance.current += Math.abs(deltaX);

    if (Math.abs(deltaX) < 0.5) {
      return;
    }

    applyRotation(deltaX * DRAG_ROTATION_SENSITIVITY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (draggingPointerId.current !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    draggingPointerId.current = null;

    if (dragDistance.current < 6) {
      applyRotation(CLICK_ROTATION_STEP);
    }
  };

  const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (draggingPointerId.current === event.pointerId) {
      draggingPointerId.current = null;
    }
  };

  return (
    <div className="map-compass-control" aria-label="Map rotation controls">
      <button
        aria-label="Rotate map view"
        className="map-compass-button"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Rotate map view"
        type="button"
      >
        <img
          alt=""
          aria-hidden="true"
          draggable={false}
          src={publicPath("/osrs-icons/compass.png")}
          style={{ transform: `rotate(${compassAngle}rad)` }}
        />
      </button>
    </div>
  );
}
