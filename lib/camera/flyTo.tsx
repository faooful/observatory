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

export function CameraRig({ bounds, pins, defaultTarget = [0, 0, 0] }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const viewVersion = useMapStore((state) => state.viewVersion);
  const initialTarget = useMemo(() => new Vector3(...defaultTarget), [defaultTarget]);
  const normalizedMapOffset = useRef(new Vector3());
  const worldViewDistance = Math.max(bounds.width, bounds.depth) * 2.5;
  const initialPosition = useMemo(() => {
    const radius = Math.max(bounds.width, bounds.depth);
    return initialTarget.clone().add(new Vector3(radius * 0.62, radius * 2.35, radius * 1.68));
  }, [bounds.depth, bounds.width, initialTarget]);
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
      position: target.clone().add(new Vector3(52, 186, 108)),
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
      const isWorldView = distance >= worldViewDistance;
      const mapViewBlend = 1 - MathUtils.smoothstep(distance, worldViewDistance * 0.82, worldViewDistance);
      controls.current.enableRotate = isWorldView;
      controls.current.enablePan = !isWorldView;
      controls.current.mouseButtons.LEFT = isWorldView ? MOUSE.ROTATE : MOUSE.PAN;
      controls.current.mouseButtons.RIGHT = MOUSE.PAN;
      controls.current.touches.ONE = isWorldView ? TOUCH.ROTATE : TOUCH.PAN;
      controls.current.touches.TWO = TOUCH.DOLLY_PAN;
      controls.current.minPolarAngle = isWorldView ? MathUtils.degToRad(18) : 0;
      controls.current.maxPolarAngle = isWorldView ? MathUtils.degToRad(162) : MathUtils.degToRad(82);

      if (!isWorldView && !isFlying.current && mapViewBlend > 0) {
        const target = controls.current.target;
        const desiredPosition = normalizedMapOffset.current.set(0, distance * 0.86, distance * 0.5).add(target);
        const easing = (1 - Math.exp(-delta * 3.8)) * mapViewBlend;
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
      zoomSpeed={2.4}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN
      }}
      screenSpacePanning
      touches={{
        ONE: TOUCH.ROTATE,
        TWO: TOUCH.DOLLY_PAN
      }}
      dampingFactor={0.08}
      maxDistance={Math.max(bounds.width, bounds.depth) * 4.2}
      minDistance={42}
      maxPolarAngle={MathUtils.degToRad(82)}
    />
  );
}
