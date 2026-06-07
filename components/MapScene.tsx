"use client";

import { Canvas } from "@react-three/fiber";
import { Fog } from "three";
import pins from "@/data/activities/osrs-pins.json";
import terrainData from "@/data/terrain/lumbridge-varrock.json";
import { CameraRig } from "@/lib/camera/flyTo";
import { getTerrainBounds, loadTerrain } from "@/lib/terrain/loadTerrain";
import type { ActivityPin, TerrainChunk as TerrainChunkType } from "@/lib/terrain/types";
import { MapPin } from "./MapPin";
import { TerrainChunk } from "./TerrainChunk";

const terrain = loadTerrain(terrainData as TerrainChunkType);
const terrainBounds = getTerrainBounds(terrain);
const activityPins = pins as ActivityPin[];

export function MapScene() {
  return (
    <div className="map-canvas">
      <Canvas
        camera={{ position: [20, 56, 92], fov: 48, near: 0.1, far: 1400 }}
        gl={{ antialias: true }}
        onCreated={({ scene }) => {
          scene.fog = new Fog("#050709", 120, 520);
        }}
      >
        <color attach="background" args={["#050709"]} />
        <ambientLight intensity={0.58} />
        <directionalLight position={[80, 120, 40]} intensity={2.4} />
        <directionalLight position={[-120, 70, -80]} intensity={0.72} color="#8db7c1" />
        <TerrainChunk terrain={terrain} />
        {activityPins.map((pin) => (
          <MapPin key={pin.id} pin={pin} terrain={terrain} />
        ))}
        <CameraRig bounds={terrainBounds} pins={activityPins} terrain={terrain} />
      </Canvas>
    </div>
  );
}
