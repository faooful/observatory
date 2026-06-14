"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraRig } from "@/lib/camera/flyTo";
import { getActivities, getVisibleActivities } from "@/lib/activities/activityModel";
import type { OsrsSceneManifest } from "@/lib/osrs-scene/types";
import { useMapStore } from "@/lib/store/useMapStore";
import type { TerrainBounds } from "@/lib/terrain/loadTerrain";
import { OsrsCacheScene } from "./OsrsCacheScene";

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
  const activeLayer = useMapStore((state) => state.activeLayer);
  const visibleActivities = useMemo(
    () => (player ? getVisibleActivities(getActivities({ player }), activeLayer) : []),
    [activeLayer, player]
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
      activeLayer,
      ids: visibleActivities.map((activity) => activity.id),
      count: visibleActivities.length
    };
    (window as ActivityDebugWindow).__OBSERVATORY_ACTIVITY_MARKERS__ = {
      activeLayer: snapshot.activeLayer,
      ids: snapshot.ids,
      count: snapshot.count
    };
    document.documentElement.dataset.activityMarkers = JSON.stringify(snapshot);
  }, [activeLayer, visibleActivities]);

  return (
    <div className="map-canvas">
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{
          position: [
            activeTarget[0] + activeRadius * 0.62,
            activeRadius * 1.18,
            activeTarget[2] + activeRadius * 2.55
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
          pins={visibleActivities.map((activity) => ({
            id: activity.id,
            x: activity.location.x,
            y: activity.location.y
          }))}
          defaultTarget={activeTarget}
          defaultWorldTarget={activeWorldTarget}
          projection={manifest?.projection}
          lod={manifest?.lod}
        />
      </Canvas>
    </div>
  );
}
