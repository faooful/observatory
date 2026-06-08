"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  MathUtils,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMapStore } from "@/lib/store/useMapStore";
import type { OsrsMapSquareAsset, OsrsSceneManifest } from "@/lib/osrs-scene/types";

const SCENE_ROOT = "/osrs-scene/osrs-238_2026-06-03";
const MAP_SQUARE_SIZE = 64;

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
  targetWorldX: number;
  targetWorldY: number;
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

function getLod(manifest: OsrsSceneManifest) {
  return {
    globeDistance: manifest.lod?.globeDistance ?? 1050,
    planeDistance: manifest.lod?.planeDistance ?? 900,
    closeDistance: manifest.lod?.closeDistance ?? 560,
    closeChunkRadius: manifest.lod?.closeChunkRadius ?? 1
  };
}

function SceneChunk({ chunk, manifest }: { chunk: LoadedChunk; manifest: OsrsSceneManifest }) {
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

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.96} metalness={0} />
    </mesh>
  );
}

function GlobeMapLOD({ manifest, view, keepCloseFallback }: { manifest: OsrsSceneManifest; view: SceneView; keepCloseFallback: boolean }) {
  const atlasPath = manifest.texturePyramid?.atlas ?? manifest.overview?.globeTexture ?? "overview/atlas.png";
  const texture = useLoader(TextureLoader, `${SCENE_ROOT}/${atlasPath}`);
  const geometry = useMemo(() => new BufferGeometry(), []);
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxY - manifest.bounds.minY;
  const radius = manifest.projection?.radius ?? Math.max(width, depth) * 0.48;
  const lod = getLod(manifest);
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
    const planeT = MathUtils.smoothstep(view.distance, lod.closeDistance, lod.planeDistance);
    const morph = 1 - planeT;
    const closeOpacity = keepCloseFallback ? 0.32 : 0.08;
    const opacity = Math.max(closeOpacity, 1 - MathUtils.smoothstep(view.distance, lod.globeDistance * 1.4, lod.globeDistance * 1.75));
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
        const sphereX = Math.cos(latitude) * Math.sin(longitude) * radius;
        const sphereY = Math.sin(latitude) * radius + radius * 0.18;
        const sphereZ = Math.cos(latitude) * Math.cos(longitude) * radius;

        positions[index * 3] = MathUtils.lerp(sphereX, planeX, morph);
        positions[index * 3 + 1] = MathUtils.lerp(sphereY, -2, morph);
        positions[index * 3 + 2] = MathUtils.lerp(sphereZ, planeZ, morph);
      }
    }

    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const material = geometry.userData.material as { opacity?: number } | undefined;
    if (material) {
      material.opacity = opacity;
    }
  });

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={(material) => {
          geometry.userData.material = material;
        }}
        map={texture}
        side={DoubleSide}
        transparent
        opacity={1}
      />
    </mesh>
  );
}

function useSceneView(manifest: OsrsSceneManifest | null) {
  const get = useThree((state) => state.get);
  const [view, setView] = useState<SceneView>(() => ({
    distance: 0,
    targetWorldX: 3244.43,
    targetWorldY: 2901.82
  }));
  const lastView = useRef(view);

  useFrame(({ camera }) => {
    if (!manifest) {
      return;
    }

    const { centerX, centerY } = getSceneCenter(manifest);
    const controls = (get() as unknown as { controls?: OrbitControlsImpl }).controls;
    const target = controls?.target ?? new Vector3(0, 0, 0);
    const nextView = {
      distance: camera.position.distanceTo(target),
      targetWorldX: MathUtils.clamp(target.x + centerX, manifest.bounds.minX, manifest.bounds.maxX),
      targetWorldY: MathUtils.clamp(centerY - target.z, manifest.bounds.minY, manifest.bounds.maxY)
    };
    const previous = lastView.current;

    if (
      Math.abs(previous.distance - nextView.distance) > 16 ||
      Math.abs(previous.targetWorldX - nextView.targetWorldX) > 8 ||
      Math.abs(previous.targetWorldY - nextView.targetWorldY) > 8
    ) {
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
  const chunksRef = useRef(chunks);
  const loadingRef = useRef(loading);
  const wantedKeysRef = useRef<Set<string>>(new Set());
  const assetsByKey = useMemo(
    () => new Map(manifest.chunks.map((asset) => [getChunkKey(asset), asset])),
    [manifest.chunks]
  );
  const lod = getLod(manifest);
  const closeBlend = 1 - MathUtils.smoothstep(view.distance, lod.closeDistance, lod.planeDistance);
  const targetMapX = Math.floor(view.targetWorldX / MAP_SQUARE_SIZE);
  const targetMapY = Math.floor(view.targetWorldY / MAP_SQUARE_SIZE);
  const radius = Math.max(0, Math.floor(lod.closeChunkRadius));

  const wantedKeys = useMemo(() => {
    if (view.distance > lod.closeDistance * 1.25) {
      return new Set<string>();
    }

    const keys = new Set<string>();
    for (let mapX = targetMapX - radius; mapX <= targetMapX + radius; mapX += 1) {
      for (let mapY = targetMapY - radius; mapY <= targetMapY + radius; mapY += 1) {
        const key = `${mapX}_${mapY}`;
        if (assetsByKey.has(key)) {
          keys.add(key);
        }
      }
    }
    return keys;
  }, [assetsByKey, lod.closeDistance, radius, targetMapX, targetMapY, view.distance]);

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
      for (const key of current.keys()) {
        if (!wantedKeys.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      if (changed) {
        chunksRef.current = next;
      }
      return changed ? next : current;
    });
  }, [wantedKeys]);

  useEffect(() => {
    for (const key of wantedKeys) {
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
  }, [assetsByKey, wantedKeys]);

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
          <SceneChunk chunk={chunk} manifest={manifest} />
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
      <StreamedSceneChunks manifest={manifest} view={view} onVisibleChunkCount={setVisibleChunkCount} />
    </group>
  );
}
