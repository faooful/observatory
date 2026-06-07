"use client";

import { Canvas } from "@react-three/fiber";
import pins from "@/data/activities/osrs-pins.json";
import terrainData from "@/data/terrain/lumbridge-varrock.json";
import { CameraRig } from "@/lib/camera/flyTo";
import { getTerrainBounds, loadTerrain } from "@/lib/terrain/loadTerrain";
import type { ActivityPin, TerrainChunk as TerrainChunkType } from "@/lib/terrain/types";
import { MapPin } from "./MapPin";
import { MapTileSurface } from "./MapTileSurface";
import { TerrainChunk } from "./TerrainChunk";

const terrain = loadTerrain(terrainData as TerrainChunkType);
const terrainBounds = getTerrainBounds(terrain);
const activityPins = pins as ActivityPin[];
const terrainRadius = Math.max(terrainBounds.width, terrainBounds.depth);

export function MapScene() {
  return (
    <div className="map-canvas">
      <Canvas
        camera={{
          position: [terrainRadius * 0.2, terrainRadius * 0.65, terrainRadius * 0.78],
          fov: 64,
          near: 0.1,
          far: terrainRadius * 5
        }}
        gl={{ antialias: true }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0, 0);
        }}
      >
        <color attach="background" args={["#050709"]} />
        <ambientLight intensity={0.86} />
        <directionalLight position={[80, 120, 40]} intensity={2.8} />
        <directionalLight position={[-120, 70, -80]} intensity={0.72} color="#8db7c1" />
        <TerrainChunk terrain={terrain} visible={false} />
        <MapTileSurface terrain={terrain} />
        {activityPins.map((pin) => (
          <MapPin key={pin.id} pin={pin} terrain={terrain} />
        ))}
        <CameraRig bounds={terrainBounds} pins={activityPins} terrain={terrain} />
      </Canvas>
    </div>
  );
}
