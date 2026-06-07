import type { Vector3Tuple } from "three";
import type { TerrainChunk } from "./types";

export const HEIGHT_SCALE = 0.08;

export type TerrainBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  depth: number;
};

export type LoadedTerrainChunk = TerrainChunk & {
  bounds: TerrainBounds;
  worldToScene: (x: number, y: number, height?: number) => Vector3Tuple;
  sampleHeight: (x: number, y: number) => number;
};

export function getTerrainBounds(chunk: TerrainChunk): TerrainBounds {
  const width = chunk.size * chunk.tileSize;
  const depth = chunk.size * chunk.tileSize;
  const minX = chunk.baseX;
  const minY = chunk.baseY;
  const maxX = minX + width;
  const maxY = minY + depth;

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: minX + width / 2,
    centerY: minY + depth / 2,
    width,
    depth
  };
}

export function loadTerrain(chunk: TerrainChunk): LoadedTerrainChunk {
  const bounds = getTerrainBounds(chunk);

  function sampleHeight(x: number, y: number) {
    const localX = Math.min(Math.max((x - chunk.baseX) / chunk.tileSize, 0), chunk.size);
    const localY = Math.min(Math.max((y - chunk.baseY) / chunk.tileSize, 0), chunk.size);
    const x0 = Math.floor(localX);
    const y0 = Math.floor(localY);
    const x1 = Math.min(x0 + 1, chunk.size);
    const y1 = Math.min(y0 + 1, chunk.size);
    const tx = localX - x0;
    const ty = localY - y0;

    const h00 = chunk.heights[y0]?.[x0] ?? 0;
    const h10 = chunk.heights[y0]?.[x1] ?? h00;
    const h01 = chunk.heights[y1]?.[x0] ?? h00;
    const h11 = chunk.heights[y1]?.[x1] ?? h10;
    const hx0 = h00 * (1 - tx) + h10 * tx;
    const hx1 = h01 * (1 - tx) + h11 * tx;

    return hx0 * (1 - ty) + hx1 * ty;
  }

  function worldToScene(x: number, y: number, height = sampleHeight(x, y)): Vector3Tuple {
    return [x - bounds.centerX, height * HEIGHT_SCALE, -(y - bounds.centerY)];
  }

  return {
    ...chunk,
    bounds,
    sampleHeight,
    worldToScene
  };
}
