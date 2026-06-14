"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  FrontSide,
  MathUtils,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from "three";
import type { Group } from "three";
import type { Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture } from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import { type PlayerLookup } from "@/lib/osrs/player";
import { getActivities, getVisibleActivities } from "@/lib/activities/activityModel";
import type { Activity } from "@/lib/activities/types";
import { useMapStore } from "@/lib/store/useMapStore";
import type { OsrsMapSquareAsset, OsrsSceneManifest } from "@/lib/osrs-scene/types";
import {
  OVERVIEW_PLANE_Y,
  getProjectionMorph,
  getProjectionTransition,
  getSurfacePointFromUv,
  mapWorldToSurface,
  surfaceToMapWorld
} from "@/lib/osrs-scene/projection";

const SCENE_ROOT = "/osrs-scene/osrs-238_2026-06-03";
const MAP_SQUARE_SIZE = 64;
const RETAIN_CHUNK_MS = 5200;
const MAX_CONCURRENT_CHUNK_LOADS = 18;

type LoadedChunk = {
  asset: OsrsMapSquareAsset;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array | Int32Array;
};

type OsrsCacheSceneProps = {
  onManifest?: (manifest: OsrsSceneManifest) => void;
};

type SceneView = {
  distance: number;
  phase: ZoomPhase;
  targetWorldX: number;
  targetWorldY: number;
  visibleMapSquareRadius: number;
  movementSpeed: number;
  chunkPriorityCenter: {
    mapX: number;
    mapY: number;
  };
};

type ZoomPhase = "globe" | "transition" | "local";

type SceneLod = ReturnType<typeof getLod>;

type MapWorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type OverviewTextureResult = {
  texture: Texture;
  mapBounds: MapWorldBounds;
  source: string;
};

type ObservatoryDebugWindow = Window & {
  __OBSERVATORY_SCENE__?: {
    distance: number;
    targetWorldX: number;
    targetWorldY: number;
    transition: number;
    morph: number;
    globeOpacity: number;
    planeOpacity: number;
    chunkOpacity: number;
    visibleMapSquareRadius: number;
  };
  __OBSERVATORY_ACTIVITY_MARKERS__?: {
    activeLayer: string;
    ids: string[];
    count: number;
  };
};

async function loadBinary<T extends Float32Array | Uint32Array | Int32Array>(
  path: string,
  create: (buffer: ArrayBuffer) => T
) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return create(await response.arrayBuffer());
}

function getChunkKey(asset: Pick<OsrsMapSquareAsset, "mapX" | "mapY">) {
  return `${asset.mapX}_${asset.mapY}`;
}

async function loadManifest() {
  const manifestResponse = await fetch(`${SCENE_ROOT}/manifest.json`);
  if (!manifestResponse.ok) {
    throw new Error(`Failed to load OSRS scene manifest: ${manifestResponse.status}`);
  }

  return (await manifestResponse.json()) as OsrsSceneManifest;
}

async function loadChunk(asset: OsrsMapSquareAsset) {
  const [positions, colors, indices] = await Promise.all([
    loadBinary(`${SCENE_ROOT}/${asset.positions}`, (buffer) => new Float32Array(buffer)),
    loadBinary(`${SCENE_ROOT}/${asset.colors}`, (buffer) => new Float32Array(buffer)),
    loadBinary(`${SCENE_ROOT}/${asset.indices}`, (buffer) => new Uint32Array(buffer))
  ]);

  return { asset, positions, colors, indices };
}

function getSceneCenter(manifest: OsrsSceneManifest) {
  return {
    centerX: (manifest.bounds.minX + manifest.bounds.maxX) / 2,
    centerY: (manifest.bounds.minY + manifest.bounds.maxY) / 2
  };
}

function scenePointToWorld(point: Vector3, manifest: OsrsSceneManifest, morph: number) {
  return surfaceToMapWorld(point, manifest.bounds, manifest.projection, morph, OVERVIEW_PLANE_Y);
}

function getLod(manifest: OsrsSceneManifest) {
  return {
    globeDistance: manifest.lod?.globeDistance ?? 1050,
    planeDistance: manifest.lod?.planeDistance ?? 900,
    closeDistance: manifest.lod?.closeDistance ?? 560,
    closeChunkRadius: manifest.lod?.closeChunkRadius ?? 1
  };
}

function getZoomPhase(distance: number, lod: SceneLod): ZoomPhase {
  if (distance > lod.planeDistance * 1.22) {
    return "globe";
  }

  if (distance > lod.closeDistance * 1.22) {
    return "transition";
  }

  return "local";
}

function getGlobeOpacity(transition: number) {
  return 1 - MathUtils.smoothstep(transition, 0.18, 0.66);
}

function getFlatOverviewOpacity(transition: number) {
  const fadeIn = MathUtils.smoothstep(transition, 0.14, 0.52);
  const fadeOut = 1 - MathUtils.smoothstep(transition, 0.88, 1);
  const closeFloor = MathUtils.smoothstep(transition, 0.86, 1) * 0.34;
  return Math.max(closeFloor, fadeIn * fadeOut);
}

function getStreamedChunkOpacity(transition: number) {
  return MathUtils.smoothstep(transition, 0.48, 0.9);
}

function getChunkRadius(distance: number, lod: SceneLod, movementSpeed: number) {
  const baseRadius = Math.max(1, Math.floor(lod.closeChunkRadius));
  const zoomBlend = 1 - MathUtils.smoothstep(distance, lod.closeDistance * 0.7, lod.planeDistance * 0.62);
  const movementBonus = movementSpeed > 360 ? 2 : movementSpeed > 140 ? 1 : 0;
  const earlyZoomBonus = distance < lod.closeDistance * 2.15 ? 1 : 0;

  return MathUtils.clamp(Math.ceil(baseRadius + zoomBlend * 2 + movementBonus + earlyZoomBonus), baseRadius, baseRadius + 5);
}

function shouldStreamChunks(distance: number, lod: SceneLod) {
  return distance <= lod.planeDistance * 0.82;
}

function sortWantedChunksByDistance(
  keys: Set<string>,
  center: { mapX: number; mapY: number },
  assetsByKey: Map<string, OsrsMapSquareAsset>
) {
  return Array.from(keys).sort((a, b) => {
    const assetA = assetsByKey.get(a);
    const assetB = assetsByKey.get(b);
    if (!assetA || !assetB) {
      return 0;
    }

    const distanceA = Math.hypot(assetA.mapX - center.mapX, assetA.mapY - center.mapY);
    const distanceB = Math.hypot(assetB.mapX - center.mapX, assetB.mapY - center.mapY);
    return distanceA - distanceB;
  });
}

function useOverviewTexture(manifest: OsrsSceneManifest): OverviewTextureResult {
  const overviewTiles = manifest.texturePyramid?.levels.find((level) => level.kind === "plane")?.overviewTiles ?? [];
  const fullTexture = manifest.overview?.fullTexture;
  const fallbackTexture =
    manifest.texturePyramid?.levels.find((level) => level.kind === "globe")?.tiles[0] ??
    manifest.overview?.globeTexture ??
    "overview/globe/0/0_0.png";
  const texturePaths = useMemo(
    () =>
      fullTexture
        ? [`${SCENE_ROOT}/${fullTexture}`]
        : overviewTiles.length > 0
          ? overviewTiles.map((tile) => `${SCENE_ROOT}/${tile.texture}`)
          : [`${SCENE_ROOT}/${fallbackTexture}`],
    [fallbackTexture, fullTexture, overviewTiles]
  );
  const textures = useLoader(TextureLoader, texturePaths) as Texture[];

  return useMemo(() => {
    if (fullTexture) {
      const [texture] = textures;
      texture.colorSpace = SRGBColorSpace;
      return {
        texture,
        mapBounds: manifest.bounds,
        source: fullTexture
      };
    }

    if (overviewTiles.length === 0) {
      const [texture] = textures;
      texture.colorSpace = SRGBColorSpace;
      return {
        texture,
        mapBounds: manifest.bounds,
        source: fallbackTexture
      };
    }

    let textureTiles = overviewTiles;
    let minWorldX = manifest.bounds.minX;
    let maxWorldX = manifest.bounds.maxX;
    let minWorldY = manifest.bounds.minY;
    let maxWorldY = manifest.bounds.maxY;

    const width = maxWorldX - minWorldX;
    const depth = maxWorldY - minWorldY;
    const canvasWidth = 2048;
    const canvasHeight = Math.round(canvasWidth * (depth / width));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    if (context) {
      context.fillStyle = "#1b3340";
      context.fillRect(0, 0, canvas.width, canvas.height);

      textureTiles.forEach((tile) => {
        const texture = textures[overviewTiles.indexOf(tile)];
        const image = texture?.image as CanvasImageSource | undefined;
        if (!image) {
          return;
        }

        const minX = tile.mapXMin * MAP_SQUARE_SIZE;
        const maxX = (tile.mapXMax + 1) * MAP_SQUARE_SIZE;
        const minY = tile.mapYMin * MAP_SQUARE_SIZE;
        const maxY = (tile.mapYMax + 1) * MAP_SQUARE_SIZE;
        const drawX = ((minX - minWorldX) / width) * canvas.width;
        const drawY = canvas.height - ((maxY - minWorldY) / depth) * canvas.height;
        const drawWidth = ((maxX - minX) / width) * canvas.width;
        const drawHeight = ((maxY - minY) / depth) * canvas.height;

        context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      });

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        const brightness = pixels[index] + pixels[index + 1] + pixels[index + 2];
        if (alpha < 24 || brightness < 42) {
          pixels[index] = 27;
          pixels[index + 1] = 51;
          pixels[index + 2] = 64;
          pixels[index + 3] = 255;
        }
      }
      context.putImageData(imageData, 0, 0);
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return {
      texture,
      source: "runtime-stitched-overview",
      mapBounds: {
        minX: minWorldX,
        maxX: maxWorldX,
        minY: minWorldY,
        maxY: maxWorldY
      }
    };
  }, [fallbackTexture, fullTexture, manifest.bounds, manifest.bounds.maxX, manifest.bounds.maxY, manifest.bounds.minX, manifest.bounds.minY, overviewTiles, textures]);
}

function SceneChunk({ chunk, manifest, opacity }: { chunk: LoadedChunk; manifest: OsrsSceneManifest; opacity: number }) {
  const material = useRef<MeshStandardMaterial>(null);
  const opacityRef = useRef(0);
  const geometry = useMemo(() => {
    const { centerX, centerY } = getSceneCenter(manifest);
    const positions = new Float32Array(chunk.positions.length);
    const colors = new Float32Array((chunk.colors.length / 4) * 3);

    for (let index = 0; index < chunk.positions.length / 3; index += 1) {
      const worldX = chunk.positions[index * 3];
      const worldHeight = chunk.positions[index * 3 + 1];
      const worldY = chunk.positions[index * 3 + 2];

      positions[index * 3] = worldX - centerX;
      positions[index * 3 + 1] = worldHeight;
      positions[index * 3 + 2] = -(worldY - centerY);
      const red = chunk.colors[index * 4];
      const green = chunk.colors[index * 4 + 1];
      const blue = chunk.colors[index * 4 + 2];
      const isMissingTextureFallback = Math.abs(red - green) < 0.018 && Math.abs(green - blue) < 0.018;

      if (isMissingTextureFallback) {
        const terrainNoise = (Math.sin(worldX * 0.19 + worldY * 0.11) + Math.sin(worldX * 0.047 - worldY * 0.073)) * 0.5;
        const warmth = MathUtils.clamp(red + terrainNoise * 0.055, 0.12, 0.86);
        colors[index * 3] = warmth * 0.72;
        colors[index * 3 + 1] = warmth * 0.82;
        colors[index * 3 + 2] = warmth * 0.62;
      } else {
        colors[index * 3] = red;
        colors[index * 3 + 1] = green;
        colors[index * 3 + 2] = blue;
      }
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute("position", new BufferAttribute(positions, 3));
    nextGeometry.setAttribute("color", new BufferAttribute(colors, 3));
    nextGeometry.setIndex(new BufferAttribute(chunk.indices, 1));
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [chunk.colors, chunk.indices, chunk.positions, manifest.bounds.maxX, manifest.bounds.maxY, manifest.bounds.minX, manifest.bounds.minY]);

  useFrame((_, delta) => {
    opacityRef.current = MathUtils.damp(opacityRef.current, opacity, 8, delta);
    if (material.current) {
      material.current.opacity = opacityRef.current;
      material.current.transparent = opacityRef.current < 0.999;
    }
  });

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      userData={{
        mapSurface: true,
        mapSurfacePriority: 40,
        mapBounds: manifest.bounds
      }}
    >
      <meshStandardMaterial
        ref={material}
        vertexColors
        side={DoubleSide}
        roughness={0.96}
        metalness={0}
        transparent
        opacity={0}
      />
    </mesh>
  );
}

function ActivityMarker({ activity, manifest, view }: { activity: Activity; manifest: OsrsSceneManifest; view: SceneView }) {
  const group = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const selectActivity = useMapStore((state) => state.selectActivity);
  const selected = selectedActivityId === activity.id;
  const color = activity.status === "blocked" ? "#7b858d" : activity.type === "boss" ? "#f06b6b" : activity.type === "money" ? "#63d7a6" : "#79a7ff";
  const point = useRef(new Vector3());

  useFrame(({ clock }) => {
    if (!group.current) {
      return;
    }

    const morph = getProjectionMorph(view.distance, manifest.bounds, manifest.lod);
    mapWorldToSurface(activity.location.x, activity.location.y, manifest.bounds, manifest.projection, morph, OVERVIEW_PLANE_Y, point.current);
    point.current.y += MathUtils.lerp(10, 34, morph);
    group.current.position.copy(point.current);
    group.current.scale.setScalar(MathUtils.lerp(1.65, 1, morph));
    group.current.rotation.y = clock.elapsedTime * 0.6;
  });

  if (
    activity.location.x < manifest.bounds.minX ||
    activity.location.x > manifest.bounds.maxX ||
    activity.location.y < manifest.bounds.minY ||
    activity.location.y > manifest.bounds.maxY
  ) {
    return null;
  }

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        selectActivity(activity.id);
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh scale={selected || hovered ? 1.25 : 1}>
        <octahedronGeometry args={[8, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected || hovered ? 1.4 : 0.55} />
      </mesh>
      <mesh position={[0, -10, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7, 10, 28]} />
        <meshBasicMaterial color={color} transparent opacity={selected || hovered ? 0.42 : 0.22} side={DoubleSide} />
      </mesh>
      {(selected || hovered) && (
        <Html position={[0, 18, 0]} center distanceFactor={38} style={{ pointerEvents: "none" }}>
          <div className="marker-label">{activity.title}</div>
        </Html>
      )}
    </group>
  );
}

function ActivityMarkers({ manifest, view }: { manifest: OsrsSceneManifest; view: SceneView }) {
  const player = useMapStore((state) => state.player);
  const activeLayer = useMapStore((state) => state.activeLayer);
  const visibleActivities = useMemo(
    () => (player ? getVisibleActivities(getActivities({ player }), activeLayer) : []),
    [activeLayer, player]
  );

  useEffect(() => {
    (window as ObservatoryDebugWindow).__OBSERVATORY_ACTIVITY_MARKERS__ = {
      activeLayer,
      ids: visibleActivities.map((activity) => activity.id),
      count: visibleActivities.length
    };
  }, [activeLayer, visibleActivities]);

  return (
    <group>
      {visibleActivities.map((activity) => (
        <ActivityMarker key={activity.id} activity={activity} manifest={manifest} view={view} />
      ))}
    </group>
  );
}

function OverviewMapLOD({ manifest, view }: { manifest: OsrsSceneManifest; view: SceneView }) {
  const { texture, mapBounds, source } = useOverviewTexture(manifest);
  const globeMesh = useRef<Mesh>(null);
  const planeMesh = useRef<Mesh>(null);
  const globeMaterial = useRef<MeshBasicMaterial>(null);
  const planeMaterial = useRef<MeshBasicMaterial>(null);
  const lod = useMemo(() => getLod(manifest), [manifest]);
  const columns = 96;
  const rows = 96;
  const vertexCount = (columns + 1) * (rows + 1);
  const uv = useMemo(() => {
    const values = new Float32Array(vertexCount * 2);
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const index = row * (columns + 1) + column;
        values[index * 2] = column / columns;
        values[index * 2 + 1] = 1 - row / rows;
      }
    }
    return values;
  }, [vertexCount]);
  const indices = useMemo(() => {
    const values: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = row * (columns + 1) + column;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        values.push(a, c, b, b, c, d);
      }
    }
    return new Uint32Array(values);
  }, []);
  const geometries = useMemo(() => {
    const globePositions = new Float32Array(vertexCount * 3);
    const planePositions = new Float32Array(vertexCount * 3);
    const surfacePoint = new Vector3();

    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        const index = row * (columns + 1) + column;
        const offset = index * 3;

        getSurfacePointFromUv(u, v, mapBounds, manifest.projection, 0, OVERVIEW_PLANE_Y, surfacePoint);
        globePositions[offset] = surfacePoint.x;
        globePositions[offset + 1] = surfacePoint.y;
        globePositions[offset + 2] = surfacePoint.z;
        getSurfacePointFromUv(u, v, mapBounds, manifest.projection, 1, OVERVIEW_PLANE_Y, surfacePoint);
        planePositions[offset] = surfacePoint.x;
        planePositions[offset + 1] = surfacePoint.y;
        planePositions[offset + 2] = surfacePoint.z;
      }
    }

    const globeGeometry = new BufferGeometry();
    globeGeometry.setAttribute("position", new BufferAttribute(globePositions, 3));
    globeGeometry.setAttribute("uv", new BufferAttribute(uv, 2));
    globeGeometry.setIndex(new BufferAttribute(indices, 1));
    globeGeometry.computeVertexNormals();

    const planeGeometry = new BufferGeometry();
    planeGeometry.setAttribute("position", new BufferAttribute(planePositions, 3));
    planeGeometry.setAttribute("uv", new BufferAttribute(uv, 2));
    planeGeometry.setIndex(new BufferAttribute(indices, 1));
    planeGeometry.computeVertexNormals();

    return { globeGeometry, planeGeometry };
  }, [
    indices,
    manifest.bounds.maxX,
    manifest.bounds.maxY,
    manifest.bounds.minX,
    manifest.bounds.minY,
    mapBounds.maxX,
    mapBounds.maxY,
    mapBounds.minX,
    mapBounds.minY,
    manifest.projection,
    uv,
    vertexCount
  ]);

  texture.colorSpace = SRGBColorSpace;

  useEffect(() => {
    if (!window.location.search.includes("debugZoom=1")) {
      return;
    }

    const image = texture.image as { width?: number; height?: number } | undefined;
    document.documentElement.dataset.observatoryTexture = JSON.stringify({
      source,
      width: image?.width ?? null,
      height: image?.height ?? null,
      mapBounds
    });
  }, [mapBounds, source, texture]);

  useFrame(() => {
    const transition = getProjectionTransition(view.distance, manifest.bounds, lod);
    const globeOpacity = getGlobeOpacity(transition);
    const planeOpacity = getFlatOverviewOpacity(transition);

    if (globeMaterial.current) {
      globeMaterial.current.opacity = globeOpacity;
      globeMaterial.current.transparent = globeOpacity < 0.999;
      globeMaterial.current.depthWrite = globeOpacity >= 0.92;
    }

    if (globeMesh.current) {
      globeMesh.current.visible = globeOpacity > 0.01;
    }

    if (planeMaterial.current) {
      planeMaterial.current.opacity = planeOpacity;
      planeMaterial.current.transparent = planeOpacity < 0.999;
      planeMaterial.current.depthWrite = planeOpacity >= 0.92;
    }

    if (planeMesh.current) {
      planeMesh.current.visible = planeOpacity > 0.01;
    }
  });

  const transition = getProjectionTransition(view.distance, manifest.bounds, lod);
  const globeOpacity = getGlobeOpacity(transition);
  const planeOpacity = getFlatOverviewOpacity(transition);

  return (
    <group>
      <mesh
        ref={globeMesh}
        geometry={geometries.globeGeometry}
        renderOrder={20}
        visible={globeOpacity > 0.01}
        userData={{
          mapSurface: true,
          mapSurfacePriority: globeOpacity >= planeOpacity ? 30 : 10,
          mapBounds,
          surfaceMorph: 0
        }}
      >
        <meshBasicMaterial ref={globeMaterial} map={texture} side={FrontSide} transparent opacity={globeOpacity} visible={globeOpacity > 0.01} />
      </mesh>
      <mesh
        ref={planeMesh}
        geometry={geometries.planeGeometry}
        renderOrder={10}
        visible={planeOpacity > 0.01}
        userData={{
          mapSurface: true,
          mapSurfacePriority: planeOpacity > globeOpacity ? 30 : 10,
          mapBounds,
          surfaceMorph: 1
        }}
      >
        <meshBasicMaterial ref={planeMaterial} map={texture} side={DoubleSide} transparent opacity={planeOpacity} visible={planeOpacity > 0.01} />
      </mesh>
    </group>
  );
}

function useSceneView(manifest: OsrsSceneManifest | null) {
  const get = useThree((state) => state.get);
  const targetScratch = useRef(new Vector3());
  const lastSample = useRef({
    at: performance.now(),
    targetWorldX: 3244.43,
    targetWorldY: 2901.82,
    distance: 0
  });
  const [view, setView] = useState<SceneView>(() => ({
    distance: 0,
    phase: "globe",
    targetWorldX: 3244.43,
    targetWorldY: 2901.82,
    visibleMapSquareRadius: 1,
    movementSpeed: 0,
    chunkPriorityCenter: {
      mapX: Math.floor(3244.43 / MAP_SQUARE_SIZE),
      mapY: Math.floor(2901.82 / MAP_SQUARE_SIZE)
    }
  }));
  const lastView = useRef(view);

  useFrame(({ camera }) => {
    if (!manifest) {
      return;
    }

    const { centerX, centerY } = getSceneCenter(manifest);
    const lod = getLod(manifest);
    const controls = (get() as unknown as { controls?: CameraControlsImpl }).controls;
    const target = controls?.getTarget(targetScratch.current) ?? targetScratch.current.set(0, 0, 0);
    const distance = camera.position.distanceTo(target);
    const transition = getProjectionTransition(distance, manifest.bounds, lod);
    const morph = getProjectionMorph(distance, manifest.bounds, lod);
    const targetWorld = scenePointToWorld(target, manifest, morph);
    const targetWorldX = targetWorld.x;
    const targetWorldY = targetWorld.y;
    const now = performance.now();
    const elapsedSeconds = Math.max((now - lastSample.current.at) / 1000, 0.016);
    const movementSpeed =
      Math.hypot(targetWorldX - lastSample.current.targetWorldX, targetWorldY - lastSample.current.targetWorldY) /
        elapsedSeconds +
      Math.abs(distance - lastSample.current.distance) / elapsedSeconds;
    const chunkPriorityCenter = {
      mapX: Math.floor(targetWorldX / MAP_SQUARE_SIZE),
      mapY: Math.floor(targetWorldY / MAP_SQUARE_SIZE)
    };
    const nextView = {
      distance,
      phase: getZoomPhase(distance, lod),
      targetWorldX,
      targetWorldY,
      visibleMapSquareRadius: shouldStreamChunks(distance, lod) ? getChunkRadius(distance, lod, movementSpeed) : 0,
      movementSpeed,
      chunkPriorityCenter
    };
    if (window.location.search.includes("debugZoom=1")) {
      (window as ObservatoryDebugWindow).__OBSERVATORY_SCENE__ = {
        distance,
        targetWorldX,
        targetWorldY,
        transition,
        morph,
        globeOpacity: getGlobeOpacity(transition),
        planeOpacity: getFlatOverviewOpacity(transition),
        chunkOpacity: getStreamedChunkOpacity(transition),
        visibleMapSquareRadius: nextView.visibleMapSquareRadius
      };
      document.documentElement.dataset.observatoryScene = JSON.stringify({
        distance,
        targetWorldX,
        targetWorldY,
        transition,
        morph,
        globeOpacity: getGlobeOpacity(transition),
        planeOpacity: getFlatOverviewOpacity(transition),
        chunkOpacity: getStreamedChunkOpacity(transition),
        visibleMapSquareRadius: nextView.visibleMapSquareRadius
      });
    }
    const previous = lastView.current;

    if (
      Math.abs(previous.distance - nextView.distance) > 16 ||
      Math.abs(previous.targetWorldX - nextView.targetWorldX) > 8 ||
      Math.abs(previous.targetWorldY - nextView.targetWorldY) > 8 ||
      previous.phase !== nextView.phase ||
      previous.visibleMapSquareRadius !== nextView.visibleMapSquareRadius
    ) {
      lastSample.current = {
        at: now,
        targetWorldX,
        targetWorldY,
        distance
      };
      lastView.current = nextView;
      setView(nextView);
    }
  });

  return view;
}

function StreamedSceneChunks({
  manifest,
  view
}: {
  manifest: OsrsSceneManifest;
  view: SceneView;
}) {
  const [chunks, setChunks] = useState<Map<string, LoadedChunk>>(() => new Map());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const retainedUntilRef = useRef<Map<string, number>>(new Map());
  const chunksRef = useRef(chunks);
  const loadingRef = useRef(loading);
  const wantedKeysRef = useRef<Set<string>>(new Set());
  const assetsByKey = useMemo(
    () => new Map(manifest.chunks.map((asset) => [getChunkKey(asset), asset])),
    [manifest.chunks]
  );
  const lod = useMemo(() => getLod(manifest), [manifest]);
  const closeBlend = getStreamedChunkOpacity(getProjectionTransition(view.distance, manifest.bounds, lod));
  const radius = view.visibleMapSquareRadius;

  const wantedKeys = useMemo(() => {
    if (!shouldStreamChunks(view.distance, lod) || radius === 0) {
      return new Set<string>();
    }

    const keys = new Set<string>();
    for (let mapX = view.chunkPriorityCenter.mapX - radius; mapX <= view.chunkPriorityCenter.mapX + radius; mapX += 1) {
      for (let mapY = view.chunkPriorityCenter.mapY - radius; mapY <= view.chunkPriorityCenter.mapY + radius; mapY += 1) {
        const key = `${mapX}_${mapY}`;
        if (assetsByKey.has(key)) {
          keys.add(key);
        }
      }
    }
    return keys;
  }, [assetsByKey, lod, radius, view.chunkPriorityCenter.mapX, view.chunkPriorityCenter.mapY, view.distance]);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    wantedKeysRef.current = wantedKeys;
    setChunks((current) => {
      let changed = false;
      const next = new Map(current);
      const now = performance.now();
      for (const key of current.keys()) {
        if (wantedKeys.has(key)) {
          retainedUntilRef.current.set(key, now + RETAIN_CHUNK_MS);
          continue;
        }

        const retainedUntil = retainedUntilRef.current.get(key) ?? 0;
        if (retainedUntil < now || !shouldStreamChunks(view.distance, lod)) {
          next.delete(key);
          retainedUntilRef.current.delete(key);
          changed = true;
        }
      }
      if (changed) {
        chunksRef.current = next;
      }
      return changed ? next : current;
    });
  }, [lod, view.distance, wantedKeys]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      setChunks((current) => {
        let changed = false;
        const next = new Map(current);
        for (const key of current.keys()) {
          if (wantedKeysRef.current.has(key)) {
            continue;
          }

          const retainedUntil = retainedUntilRef.current.get(key) ?? 0;
          if (retainedUntil < now || !shouldStreamChunks(view.distance, lod)) {
            next.delete(key);
            retainedUntilRef.current.delete(key);
            changed = true;
          }
        }

        if (changed) {
          chunksRef.current = next;
        }
        return changed ? next : current;
      });
    }, 800);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [lod, view.distance]);

  useEffect(() => {
    const sortedKeys = sortWantedChunksByDistance(wantedKeys, view.chunkPriorityCenter, assetsByKey);
    let availableLoadSlots = Math.max(0, MAX_CONCURRENT_CHUNK_LOADS - loadingRef.current.size);
    for (const key of sortedKeys) {
      if (availableLoadSlots <= 0) {
        break;
      }

      if (chunksRef.current.has(key) || loadingRef.current.has(key)) {
        continue;
      }

      const asset = assetsByKey.get(key);
      if (!asset) {
        continue;
      }

      setLoading((current) => {
        const next = new Set(current).add(key);
        loadingRef.current = next;
        return next;
      });
      availableLoadSlots -= 1;
      loadChunk(asset)
        .then((chunk) => {
          setChunks((current) => {
            if (!wantedKeysRef.current.has(key)) {
              return current;
            }
            const next = new Map(current);
            next.set(key, chunk);
            retainedUntilRef.current.set(key, performance.now() + RETAIN_CHUNK_MS);
            chunksRef.current = next;
            return next;
          });
        })
        .catch((error: unknown) => {
          if (error instanceof TypeError && error.message === "Failed to fetch") {
            return;
          }

          console.error(error);
        })
        .finally(() => {
          setLoading((current) => {
            const next = new Set(current);
            next.delete(key);
            loadingRef.current = next;
            return next;
          });
        });
    }
  }, [assetsByKey, view.chunkPriorityCenter, wantedKeys]);

  if (closeBlend <= 0.01 || chunks.size === 0) {
    return null;
  }

  return (
    <group>
      {Array.from(chunks.entries()).map(([key, chunk]) => (
        <group key={key}>
          <SceneChunk chunk={chunk} manifest={manifest} opacity={closeBlend} />
        </group>
      ))}
    </group>
  );
}

export function OsrsCacheScene({ onManifest }: OsrsCacheSceneProps) {
  const [manifest, setManifest] = useState<OsrsSceneManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const view = useSceneView(manifest);

  useEffect(() => {
    let active = true;

    loadManifest()
      .then((nextManifest) => {
        if (!active) {
          return;
        }
        setManifest(nextManifest);
        onManifest?.(nextManifest);
      })
      .catch((nextError: unknown) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      });

    return () => {
      active = false;
    };
  }, [onManifest]);

  useEffect(() => {
    if (selectedPinId) {
      setError(null);
    }
  }, [selectedPinId]);

  if (error) {
    return null;
  }

  if (!manifest) {
    return null;
  }

  return (
    <group>
      <OverviewMapLOD manifest={manifest} view={view} />
      <ActivityMarkers manifest={manifest} view={view} />
      <StreamedSceneChunks manifest={manifest} view={view} />
    </group>
  );
}
