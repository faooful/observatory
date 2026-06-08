"use client";

import { Canvas } from "@react-three/fiber";
import pins from "@/data/activities/osrs-pins.json";
import { CameraRig } from "@/lib/camera/flyTo";
import type { TerrainBounds } from "@/lib/terrain/loadTerrain";
import type { ActivityPin } from "@/lib/terrain/types";
import { OsrsCacheScene } from "./OsrsCacheScene";

const activityPins = pins as ActivityPin[];
const sceneBounds: TerrainBounds = {
  minX: 3072,
  maxX: 3456,
  minY: 2752,
  maxY: 3264,
  centerX: 3264,
  centerY: 3008,
  width: 384,
  depth: 512
};
const defaultTarget: [number, number, number] = [
  3244.43 - sceneBounds.centerX,
  0,
  -(2901.82 - sceneBounds.centerY)
];
const sceneRadius = Math.max(sceneBounds.width, sceneBounds.depth);

export function MapScene() {
  return (
    <div className="map-canvas">
      <Canvas
        camera={{
          position: [
            defaultTarget[0] + sceneRadius * 0.62,
            sceneRadius * 2.35,
            defaultTarget[2] + sceneRadius * 1.68
          ],
          fov: 42,
          near: 0.1,
          far: sceneRadius * 12
        }}
        gl={{ antialias: true }}
        onCreated={({ camera }) => {
          camera.lookAt(...defaultTarget);
        }}
      >
        <color attach="background" args={["#050709"]} />
        <ambientLight intensity={0.42} />
        <directionalLight position={[80, 160, 44]} intensity={2.8} />
        <directionalLight position={[-120, 90, -80]} intensity={0.52} color="#8db7c1" />
        <OsrsCacheScene />
        <CameraRig bounds={sceneBounds} pins={activityPins} defaultTarget={defaultTarget} />
      </Canvas>
    </div>
  );
}
