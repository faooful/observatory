"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMapStore } from "@/lib/store/useMapStore";
import type { LoadedTerrainChunk, TerrainBounds } from "@/lib/terrain/loadTerrain";
import type { ActivityPin } from "@/lib/terrain/types";

type CameraRigProps = {
  bounds: TerrainBounds;
  pins: ActivityPin[];
  terrain: LoadedTerrainChunk;
};

const initialPosition = new Vector3(20, 56, 92);
const initialTarget = new Vector3(0, 0, 0);

export function CameraRig({ bounds, pins, terrain }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const viewVersion = useMapStore((state) => state.viewVersion);
  const destination = useRef({
    position: initialPosition.clone(),
    target: initialTarget.clone()
  });

  const selectedPin = useMemo(() => pins.find((pin) => pin.id === selectedPinId), [pins, selectedPinId]);

  useEffect(() => {
    if (!selectedPin) {
      destination.current = {
        position: initialPosition.clone(),
        target: initialTarget.clone()
      };
      return;
    }

    const [x, y, z] = terrain.worldToScene(selectedPin.x, selectedPin.y, terrain.sampleHeight(selectedPin.x, selectedPin.y));
    const target = new Vector3(x, y + 1.4, z);
    destination.current = {
      position: target.clone().add(new Vector3(22, 34, 42)),
      target
    };
  }, [selectedPin, terrain, viewVersion]);

  useEffect(() => {
    destination.current = {
      position: initialPosition.clone(),
      target: initialTarget.clone()
    };
  }, [viewVersion]);

  useFrame((_, delta) => {
    const easing = 1 - Math.exp(-delta * 2.8);
    camera.position.lerp(destination.current.position, easing);

    if (controls.current) {
      controls.current.target.lerp(destination.current.target, easing);
      controls.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      maxDistance={Math.max(bounds.width, bounds.depth) * 1.4}
      minDistance={24}
      maxPolarAngle={MathUtils.degToRad(78)}
    />
  );
}
