import { Color } from "three";
import { HEIGHT_SCALE, type LoadedTerrainChunk } from "./loadTerrain";

export type TerrainMeshData = {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
};

const lowColor = new Color("#243b40");
const midColor = new Color("#526e5f");
const highColor = new Color("#aab098");

export function buildTerrainMesh(terrain: LoadedTerrainChunk): TerrainMeshData {
  const sampleCount = terrain.size + 1;
  const positions = new Float32Array(sampleCount * sampleCount * 3);
  const colors = new Float32Array(sampleCount * sampleCount * 3);
  const indices = new Uint32Array(terrain.size * terrain.size * 6);
  const flatHeights = terrain.heights.flat();
  const minHeight = Math.min(...flatHeights);
  const maxHeight = Math.max(...flatHeights);
  const heightRange = Math.max(maxHeight - minHeight, 1);

  let vertexOffset = 0;
  for (let row = 0; row < sampleCount; row += 1) {
    for (let col = 0; col < sampleCount; col += 1) {
      const worldX = terrain.baseX + col * terrain.tileSize;
      const worldY = terrain.baseY + row * terrain.tileSize;
      const height = terrain.heights[row]?.[col] ?? 0;
      const [sceneX, sceneY, sceneZ] = terrain.worldToScene(worldX, worldY, height);
      const normalizedHeight = (height - minHeight) / heightRange;
      const color = normalizedHeight < 0.5
        ? lowColor.clone().lerp(midColor, normalizedHeight * 2)
        : midColor.clone().lerp(highColor, (normalizedHeight - 0.5) * 2);

      positions[vertexOffset * 3] = sceneX;
      positions[vertexOffset * 3 + 1] = sceneY;
      positions[vertexOffset * 3 + 2] = sceneZ;
      colors[vertexOffset * 3] = color.r;
      colors[vertexOffset * 3 + 1] = color.g;
      colors[vertexOffset * 3 + 2] = color.b;
      vertexOffset += 1;
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < terrain.size; row += 1) {
    for (let col = 0; col < terrain.size; col += 1) {
      const topLeft = row * sampleCount + col;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * sampleCount + col;
      const bottomRight = bottomLeft + 1;

      indices[indexOffset] = topLeft;
      indices[indexOffset + 1] = bottomLeft;
      indices[indexOffset + 2] = topRight;
      indices[indexOffset + 3] = topRight;
      indices[indexOffset + 4] = bottomLeft;
      indices[indexOffset + 5] = bottomRight;
      indexOffset += 6;
    }
  }

  return { positions, colors, indices };
}
