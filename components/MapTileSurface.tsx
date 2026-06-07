"use client";

import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import { DoubleSide } from "three";
import type { LoadedTerrainChunk } from "@/lib/terrain/loadTerrain";

const MAP_ID = 0;
const CACHE_VERSION = "2019-10-31_1";
const PLANE = 0;
const ZOOM = 1;
const TILE_PIXELS = 256;
const TILE_WORLD_SIZE = TILE_PIXELS / 2 ** ZOOM;
const SURFACE_Y = 0.12;

type MapTileSurfaceProps = {
  terrain: LoadedTerrainChunk;
};

type Tile = {
  id: string;
  url: string;
  centerX: number;
  centerY: number;
};

function getTileUrl(tileX: number, tileY: number) {
  return `https://maps.runescape.wiki/osrs/tiles/${MAP_ID}_${CACHE_VERSION}/${ZOOM}/${PLANE}_${tileX}_${tileY}.png`;
}

export function MapTileSurface({ terrain }: MapTileSurfaceProps) {
  const tiles = useMemo<Tile[]>(() => {
    const minTileX = Math.floor(terrain.bounds.minX / TILE_WORLD_SIZE);
    const maxTileX = Math.ceil(terrain.bounds.maxX / TILE_WORLD_SIZE) - 1;
    const minTileY = Math.floor(terrain.bounds.minY / TILE_WORLD_SIZE);
    const maxTileY = Math.ceil(terrain.bounds.maxY / TILE_WORLD_SIZE) - 1;
    const nextTiles: Tile[] = [];

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
        nextTiles.push({
          id: `${tileX}-${tileY}`,
          url: getTileUrl(tileX, tileY),
          centerX: tileX * TILE_WORLD_SIZE + TILE_WORLD_SIZE / 2,
          centerY: tileY * TILE_WORLD_SIZE + TILE_WORLD_SIZE / 2
        });
      }
    }

    return nextTiles;
  }, [terrain.bounds.maxX, terrain.bounds.maxY, terrain.bounds.minX, terrain.bounds.minY]);

  const textures = useTexture(tiles.map((tile) => tile.url));

  return (
    <group>
      {tiles.map((tile, index) => {
        const texture = Array.isArray(textures) ? textures[index] : textures;
        const sceneX = tile.centerX - terrain.bounds.centerX;
        const sceneZ = -(tile.centerY - terrain.bounds.centerY);

        return (
          <mesh key={tile.id} position={[sceneX, SURFACE_Y, sceneZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[TILE_WORLD_SIZE, TILE_WORLD_SIZE]} />
            <meshBasicMaterial map={texture} side={DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}
