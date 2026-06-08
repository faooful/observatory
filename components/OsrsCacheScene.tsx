"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { MeshBasicMaterial, MeshStandardMaterial, Texture } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMapStore } from "@/lib/store/useMapStore";
import type { OsrsMapSquareAsset, OsrsOverviewTile, OsrsSceneManifest } from "@/lib/osrs-scene/types";

const SCENE_ROOT = "/osrs-scene/osrs-238_2026-06-03";
const MAP_SQUARE_SIZE = 64;
const RETAIN_CHUNK_MS = 2400;

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

type OverviewTextureMode = "full" | "surface-globe";

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

function getLod(manifest: OsrsSceneManifest) {
  return {
    globeDistance: manifest.lod?.globeDistance ?? 1050,
    planeDistance: manifest.lod?.planeDistance ?? 900,
    closeDistance: manifest.lod?.closeDistance ?? 560,
    closeChunkRadius: manifest.lod?.closeChunkRadius ?? 1
  };
}

function getZoomPhase(distance: number, lod: SceneLod): ZoomPhase {
  if (distance > lod.planeDistance * 1.05) {
    return "globe";
  }

  if (distance > lod.closeDistance * 1.45) {
    return "transition";
  }

  return "local";
}

function getChunkRadius(distance: number, lod: SceneLod, movementSpeed: number) {
  const baseRadius = Math.max(1, Math.floor(lod.closeChunkRadius));
  const zoomBlend = 1 - MathUtils.smoothstep(distance, lod.closeDistance * 0.7, lod.planeDistance * 0.62);
  const movementBonus = movementSpeed > 360 ? 2 : movementSpeed > 140 ? 1 : 0;
  const earlyZoomBonus = distance < lod.closeDistance * 2.15 ? 1 : 0;

  return MathUtils.clamp(Math.ceil(baseRadius + zoomBlend * 2 + movementBonus + earlyZoomBonus), baseRadius, baseRadius + 5);
}

function shouldStreamChunks(distance: number, lod: SceneLod) {
  return distance <= lod.closeDistance * 2.4;
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

function useOverviewTexture(manifest: OsrsSceneManifest, mode: OverviewTextureMode = "full") {
  const overviewTiles = manifest.texturePyramid?.levels.find((level) => level.kind === "plane")?.overviewTiles ?? [];
  const fallbackTexture =
    manifest.texturePyramid?.levels.find((level) => level.kind === "globe")?.tiles[0] ??
    manifest.overview?.globeTexture ??
    "overview/globe/0/0_0.png";
  const texturePaths = useMemo(
    () => (overviewTiles.length > 0 ? overviewTiles.map((tile) => `${SCENE_ROOT}/${tile.texture}`) : [`${SCENE_ROOT}/${fallbackTexture}`]),
    [fallbackTexture, overviewTiles]
  );
  const textures = useLoader(TextureLoader, texturePaths) as Texture[];

  return useMemo(() => {
    if (overviewTiles.length === 0) {
      const [texture] = textures;
      texture.colorSpace = SRGBColorSpace;
      return texture;
    }

    let textureTiles = overviewTiles;
    let minWorldX = manifest.bounds.minX;
    let maxWorldX = manifest.bounds.maxX;
    let minWorldY = manifest.bounds.minY;
    let maxWorldY = manifest.bounds.maxY;

    if (mode === "surface-globe") {
      const rowStats = new Map<number, { alpha: number; dark: number; blueGreen: number; total: number }>();

      overviewTiles.forEach((tile, index) => {
        const image = textures[index]?.image as CanvasImageSource | undefined;
        if (!image) {
          return;
        }

        const sampleCanvas = document.createElement("canvas");
        const sampleContext = sampleCanvas.getContext("2d");
        if (!sampleContext) {
          return;
        }

        sampleCanvas.width = 32;
        sampleCanvas.height = 32;
        sampleContext.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
        const { data } = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
        const stats = rowStats.get(tile.y) ?? { alpha: 0, dark: 0, blueGreen: 0, total: 0 };

        for (let offset = 0; offset < data.length; offset += 4) {
          const alpha = data[offset + 3];
          if (alpha <= 16) {
            stats.total += 1;
            continue;
          }

          const red = data[offset];
          const green = data[offset + 1];
          const blue = data[offset + 2];
          stats.alpha += 1;
          stats.total += 1;
          if (red + green + blue < 60) {
            stats.dark += 1;
          }
          if (blue > 55 && (green > 45 || red < 80)) {
            stats.blueGreen += 1;
          }
        }

        rowStats.set(tile.y, stats);
      });

      const surfaceRows = new Set<number>();
      rowStats.forEach((stats, row) => {
        const alphaRatio = stats.alpha / Math.max(1, stats.total);
        const darkRatio = stats.dark / Math.max(1, stats.alpha);
        const blueGreenRatio = stats.blueGreen / Math.max(1, stats.alpha);
        if (alphaRatio > 0.25 && darkRatio < 0.28 && blueGreenRatio > 0.32) {
          surfaceRows.add(row);
        }
      });

      if (surfaceRows.size > 0) {
        textureTiles = overviewTiles.filter((tile) => surfaceRows.has(tile.y));
        minWorldX = Math.min(...textureTiles.map((tile) => tile.mapXMin * MAP_SQUARE_SIZE));
        maxWorldX = Math.max(...textureTiles.map((tile) => (tile.mapXMax + 1) * MAP_SQUARE_SIZE));
        minWorldY = Math.min(...textureTiles.map((tile) => tile.mapYMin * MAP_SQUARE_SIZE));
        maxWorldY = Math.max(...textureTiles.map((tile) => (tile.mapYMax + 1) * MAP_SQUARE_SIZE));
      }
    }

    const width = maxWorldX - minWorldX;
    const depth = maxWorldY - minWorldY;
    const canvasWidth = 2048;
    const canvasHeight = mode === "surface-globe" ? 1024 : Math.round(canvasWidth * (depth / width));
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
    return texture;
  }, [manifest.bounds.maxX, manifest.bounds.maxY, manifest.bounds.minX, manifest.bounds.minY, mode, overviewTiles, textures]);
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
      colors[index * 3] = chunk.colors[index * 4];
      colors[index * 3 + 1] = chunk.colors[index * 4 + 1];
      colors[index * 3 + 2] = chunk.colors[index * 4 + 2];
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
    <mesh geometry={geometry} receiveShadow>
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

function GlobeMapLOD({ manifest, view, keepCloseFallback }: { manifest: OsrsSceneManifest; view: SceneView; keepCloseFallback: boolean }) {
  const texture = useOverviewTexture(manifest, "surface-globe");
  const geometry = useMemo(() => new BufferGeometry(), []);
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxY - manifest.bounds.minY;
  const radius = manifest.projection?.radius ?? Math.max(width, depth) * 0.48;
  const lod = useMemo(() => getLod(manifest), [manifest]);
  const columns = 96;
  const rows = 96;
  const uv = useMemo(() => {
    const values = new Float32Array((columns + 1) * (rows + 1) * 2);
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const index = row * (columns + 1) + column;
        values[index * 2] = column / columns;
        values[index * 2 + 1] = 1 - row / rows;
      }
    }
    return values;
  }, []);
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

  texture.colorSpace = SRGBColorSpace;

  useFrame(() => {
    const planeT = MathUtils.smoothstep(view.distance, lod.closeDistance * 1.25, lod.planeDistance * 0.62);
    const morph = 1 - planeT;
    const closeOpacity = keepCloseFallback ? 0.2 : 0;
    const opacity = Math.max(closeOpacity, MathUtils.smoothstep(view.distance, lod.closeDistance * 0.9, lod.closeDistance * 1.45));
    const positions = new Float32Array((columns + 1) * (rows + 1) * 3);

    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      const latitude = (0.5 - v) * Math.PI;
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        const longitude = (u - 0.5) * Math.PI * 2;
        const index = row * (columns + 1) + column;
        const planeX = (u - 0.5) * width;
        const planeZ = (v - 0.5) * depth;
        const globeX = Math.cos(latitude) * Math.sin(longitude) * radius;
        const globeY = Math.sin(latitude) * radius + radius * 0.18;
        const globeZ = Math.cos(latitude) * Math.cos(longitude) * radius;

        positions[index * 3] = MathUtils.lerp(globeX, planeX, morph);
        positions[index * 3 + 1] = MathUtils.lerp(globeY, -2, morph);
        positions[index * 3 + 2] = MathUtils.lerp(globeZ, planeZ, morph);
      }
    }

    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const material = geometry.userData.material as MeshBasicMaterial | undefined;
    if (material) {
      material.opacity = opacity;
      material.transparent = opacity < 0.999;
      material.depthWrite = opacity >= 0.999;
      material.needsUpdate = true;
    }
  });

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={(material) => {
          geometry.userData.material = material;
        }}
        map={texture}
        side={FrontSide}
        transparent={false}
        opacity={1}
      />
    </mesh>
  );
}

function PlaneOverviewTile({ manifest, tile, opacity }: { manifest: OsrsSceneManifest; tile: OsrsOverviewTile; opacity: number }) {
  const texture = useLoader(TextureLoader, `${SCENE_ROOT}/${tile.texture}`);
  const { centerX, centerY } = getSceneCenter(manifest);
  const minX = tile.mapXMin * MAP_SQUARE_SIZE;
  const maxX = (tile.mapXMax + 1) * MAP_SQUARE_SIZE;
  const minY = tile.mapYMin * MAP_SQUARE_SIZE;
  const maxY = (tile.mapYMax + 1) * MAP_SQUARE_SIZE;

  texture.colorSpace = SRGBColorSpace;

  return (
    <mesh
      position={[(minX + maxX) / 2 - centerX, -3, -((minY + maxY) / 2 - centerY)]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[maxX - minX, maxY - minY]} />
      <meshBasicMaterial map={texture} side={DoubleSide} transparent opacity={opacity} />
    </mesh>
  );
}

function PlaneOverviewTiles({ manifest, view }: { manifest: OsrsSceneManifest; view: SceneView }) {
  const texture = useOverviewTexture(manifest);
  const lod = useMemo(() => getLod(manifest), [manifest]);
  const { centerX, centerY } = getSceneCenter(manifest);
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxY - manifest.bounds.minY;
  const farFade = 1 - MathUtils.smoothstep(view.distance, lod.closeDistance * 1.4, lod.planeDistance * 0.58);
  const closeFallback = MathUtils.lerp(0.42, 1, MathUtils.smoothstep(view.distance, lod.closeDistance * 0.62, lod.closeDistance * 1.35));
  const opacity = farFade * closeFallback;

  if (opacity <= 0.01) {
    return null;
  }

  return (
    <mesh position={[centerX - centerX, -3, -(centerY - centerY)]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={texture} side={DoubleSide} transparent opacity={opacity} />
    </mesh>
  );
}

function useSceneView(manifest: OsrsSceneManifest | null) {
  const get = useThree((state) => state.get);
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
    const controls = (get() as unknown as { controls?: OrbitControlsImpl }).controls;
    const target = controls?.target ?? new Vector3(0, 0, 0);
    const distance = camera.position.distanceTo(target);
    const targetWorldX = MathUtils.clamp(target.x + centerX, manifest.bounds.minX, manifest.bounds.maxX);
    const targetWorldY = MathUtils.clamp(centerY - target.z, manifest.bounds.minY, manifest.bounds.maxY);
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
  view,
  onVisibleChunkCount
}: {
  manifest: OsrsSceneManifest;
  view: SceneView;
  onVisibleChunkCount: (count: number) => void;
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
  const closeBlend = 1 - MathUtils.smoothstep(view.distance, lod.closeDistance * 0.7, lod.planeDistance * 0.58);
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
    for (const key of sortedKeys) {
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

  useEffect(() => {
    onVisibleChunkCount(closeBlend > 0.01 ? chunks.size : 0);
  }, [chunks.size, closeBlend, onVisibleChunkCount]);

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
  const [visibleChunkCount, setVisibleChunkCount] = useState(0);
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
      <GlobeMapLOD manifest={manifest} view={view} keepCloseFallback={visibleChunkCount === 0} />
      <PlaneOverviewTiles manifest={manifest} view={view} />
      <StreamedSceneChunks manifest={manifest} view={view} onVisibleChunkCount={setVisibleChunkCount} />
    </group>
  );
}
