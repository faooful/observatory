"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MOUSE, MathUtils, TOUCH, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMapStore } from "@/lib/store/useMapStore";
import type { TerrainBounds } from "@/lib/terrain/loadTerrain";
import type { ActivityPin } from "@/lib/terrain/types";

type CameraRigProps = {
  bounds: TerrainBounds;
  pins: ActivityPin[];
  defaultTarget?: [number, number, number];
};

type CameraPhase = "globe" | "transition" | "local";

function getCameraPhase(distance: number, radius: number): CameraPhase {
  if (distance >= radius * 2.45) {
    return "globe";
  }

  if (distance >= radius * 0.42) {
    return "transition";
  }

  return "local";
}

export function CameraRig({ bounds, pins, defaultTarget = [0, 0, 0] }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const viewVersion = useMapStore((state) => state.viewVersion);
  const initialTarget = useMemo(() => new Vector3(...defaultTarget), [defaultTarget]);
  const normalizedMapOffset = useRef(new Vector3());
  const activeRadius = Math.max(bounds.width, bounds.depth);
  const initialPosition = useMemo(() => {
    return initialTarget.clone().add(new Vector3(activeRadius * 0.62, activeRadius * 1.18, activeRadius * 2.55));
  }, [activeRadius, initialTarget]);
  const destination = useRef({
    position: initialPosition.clone(),
    target: initialTarget.clone()
  });
  const isFlying = useRef(false);

  const selectedPin = useMemo(() => pins.find((pin) => pin.id === selectedPinId), [pins, selectedPinId]);

  useEffect(() => {
    if (!selectedPin) {
      destination.current = {
        position: initialPosition.clone(),
        target: initialTarget.clone()
      };
      isFlying.current = true;
      return;
    }

    const target = new Vector3(
      selectedPin.x - bounds.centerX,
      1.4,
      -(selectedPin.y - bounds.centerY)
    );
    destination.current = {
      position: target.clone().add(new Vector3(0, 186, 96)),
      target
    };
    isFlying.current = true;
  }, [bounds.centerX, bounds.centerY, initialPosition, initialTarget, selectedPin, viewVersion]);

  useLayoutEffect(() => {
    camera.position.copy(initialPosition);
    camera.lookAt(initialTarget);
    controls.current?.target.copy(initialTarget);
    controls.current?.update();
    destination.current = {
      position: initialPosition.clone(),
      target: initialTarget.clone()
    };
    isFlying.current = false;
  }, [camera, initialPosition, viewVersion]);

  useFrame((_, delta) => {
    if (controls.current) {
      const distance = camera.position.distanceTo(controls.current.target);
      const phase = getCameraPhase(distance, activeRadius);
      const mapViewBlend = 1 - MathUtils.smoothstep(distance, activeRadius * 0.42, activeRadius * 2.15);
      const localBlend = 1 - MathUtils.smoothstep(distance, activeRadius * 0.26, activeRadius * 0.72);
      const isGlobe = phase === "globe";
      controls.current.enableRotate = phase !== "local";
      controls.current.enablePan = !isGlobe;
      controls.current.mouseButtons.LEFT = isGlobe ? MOUSE.ROTATE : MOUSE.PAN;
      controls.current.mouseButtons.RIGHT = MOUSE.PAN;
      controls.current.touches.ONE = isGlobe ? TOUCH.ROTATE : TOUCH.PAN;
      controls.current.touches.TWO = TOUCH.DOLLY_PAN;
      controls.current.minPolarAngle = MathUtils.degToRad(MathUtils.lerp(18, 0, mapViewBlend));
      controls.current.maxPolarAngle = MathUtils.degToRad(MathUtils.lerp(162, 74, mapViewBlend));

      if (!isGlobe && !isFlying.current && mapViewBlend > 0) {
        const target = controls.current.target;
        const desiredOffset = normalizedMapOffset.current
          .set(0, MathUtils.lerp(0.72, 0.96, localBlend), MathUtils.lerp(0.56, 0.24, localBlend))
          .setLength(distance);
        const desiredPosition = normalizedMapOffset.current
          .copy(desiredOffset)
          .add(target);
        const easing = (1 - Math.exp(-delta * 4.2)) * mapViewBlend;
        camera.position.lerp(desiredPosition, easing);
        camera.lookAt(target);
        controls.current.update();
      }
    }

    if (!isFlying.current) {
      return;
    }

    const easing = 1 - Math.exp(-delta * 2.8);
    camera.position.lerp(destination.current.position, easing);

    if (controls.current) {
      controls.current.target.lerp(destination.current.target, easing);
      controls.current.update();
    }

    const targetDistance = controls.current
      ? controls.current.target.distanceTo(destination.current.target)
      : 0;
    if (camera.position.distanceTo(destination.current.position) < 0.35 && targetDistance < 0.35) {
      camera.position.copy(destination.current.position);
      if (controls.current) {
        controls.current.target.copy(destination.current.target);
        controls.current.update();
      }
      isFlying.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      enablePan
      enableRotate
      enableZoom
      zoomSpeed={3.2}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN
      }}
      screenSpacePanning
      zoomToCursor
      touches={{
        ONE: TOUCH.ROTATE,
        TWO: TOUCH.DOLLY_PAN
      }}
      dampingFactor={0.052}
      maxDistance={activeRadius * 4.2}
      minDistance={42}
      maxPolarAngle={MathUtils.degToRad(82)}
    />
  );
}
