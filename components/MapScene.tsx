"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraRig } from "@/lib/camera/flyTo";
import { getTabActivities } from "@/lib/activities/activityModel";
import type { OsrsSceneManifest } from "@/lib/osrs-scene/types";
import { useMapStore } from "@/lib/store/useMapStore";
import type { TerrainBounds } from "@/lib/terrain/loadTerrain";
import { OsrsCacheScene } from "./OsrsCacheScene";

const sceneBounds: TerrainBounds = {
  minX: 960,
  maxX: 4224,
  minY: 1728,
  maxY: 4288,
  centerX: 2592,
  centerY: 3008,
  width: 3264,
  depth: 2560
};
const sceneProjection: OsrsSceneManifest["projection"] = {
  type: "globe-to-plane",
  radius: 1566.72,
  worldWidth: 3264,
  worldDepth: 2560,
  latitudeLimit: 1.4765485471872026
};
const sceneLod: OsrsSceneManifest["lod"] = {
  globeDistance: 5875.2,
  planeDistance: 4406.400000000001,
  closeDistance: 520,
  closeChunkRadius: 2
};

function getManifestBounds(manifest: OsrsSceneManifest): TerrainBounds {
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxY - manifest.bounds.minY;
  return {
    minX: manifest.bounds.minX,
    maxX: manifest.bounds.maxX,
    minY: manifest.bounds.minY,
    maxY: manifest.bounds.maxY,
    centerX: (manifest.bounds.minX + manifest.bounds.maxX) / 2,
    centerY: (manifest.bounds.minY + manifest.bounds.maxY) / 2,
    width,
    depth
  };
}

function CameraClip({ far }: { far: number }) {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.far = far;
    camera.updateProjectionMatrix();
  }, [camera, far]);

  return null;
}

type ActivityDebugWindow = Window & {
  __OBSERVATORY_ACTIVITY_MARKERS__?: {
    activeLayer: string;
    ids: string[];
    count: number;
  };
};

export function MapScene() {
  const [manifest, setManifest] = useState<OsrsSceneManifest | null>(null);
  const player = useMapStore((state) => state.player);
  const visibleAvailableActivities = useMemo(
    () => (player ? (["quest", "money", "boss"] as const).flatMap((type) => getTabActivities({ player }, type)) : []),
    [player]
  );
  const activeBounds = useMemo(() => (manifest ? getManifestBounds(manifest) : sceneBounds), [manifest]);
  const activeTarget = useMemo<[number, number, number]>(
    () => [3244.43 - activeBounds.centerX, 0, -(2901.82 - activeBounds.centerY)],
    [activeBounds.centerX, activeBounds.centerY]
  );
  const activeWorldTarget = useMemo(() => ({ x: 3244.43, y: 2901.82 }), []);
  const activeRadius = Math.max(activeBounds.width, activeBounds.depth);

  useEffect(() => {
    const snapshot = {
      activeLayer: "available",
      ids: visibleAvailableActivities.map((activity) => activity.id),
      count: visibleAvailableActivities.length
    };
    (window as ActivityDebugWindow).__OBSERVATORY_ACTIVITY_MARKERS__ = {
      activeLayer: snapshot.activeLayer,
      ids: snapshot.ids,
      count: snapshot.count
    };
    document.documentElement.dataset.activityMarkers = JSON.stringify(snapshot);
  }, [visibleAvailableActivities]);

  return (
    <div className="map-canvas">
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{
          position: [
            activeTarget[0] + activeRadius * 0.62,
            activeRadius * 1.08,
            activeTarget[2] + activeRadius * 2.28
          ],
          fov: 42,
          near: 0.1,
          far: activeRadius * 12
        }}
        gl={{ antialias: true }}
        onCreated={({ camera }) => {
          camera.lookAt(...activeTarget);
        }}
      >
        <color attach="background" args={["#050709"]} />
        <ambientLight intensity={0.42} />
        <directionalLight position={[80, 160, 44]} intensity={2.8} />
        <directionalLight position={[-120, 90, -80]} intensity={0.52} color="#8db7c1" />
        <OsrsCacheScene onManifest={setManifest} />
        <CameraClip far={activeRadius * 12} />
        <CameraRig
          bounds={activeBounds}
          pins={visibleAvailableActivities.map((activity) => ({
            id: activity.id,
            x: activity.location.x,
            y: activity.location.y
          }))}
          defaultTarget={activeTarget}
          defaultWorldTarget={activeWorldTarget}
          projection={manifest?.projection ?? sceneProjection}
          lod={manifest?.lod ?? sceneLod}
        />
      </Canvas>
    </div>
  );
}
