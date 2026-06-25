import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OsrsMapSquareAsset, OsrsSceneManifest } from "../lib/osrs-scene/types";

const SCENE_DIR = "public/osrs-scene/osrs-238_2026-06-03";
const MANIFEST_PATH = join(SCENE_DIR, "manifest.json");
const PACKED_CHUNK_MAGIC = 0x4f534350;
const PACKED_CHUNK_VERSION = 1;
const PACKED_CHUNK_HAS_UVS = 1 << 0;
const PACKED_CHUNK_HAS_TEXTURE_INDICES = 1 << 1;
const PACKED_POSITION_SCALE = 128;
const PACKED_UV_SCALE = 32768;
const MAP_SQUARE_SIZE = 64;

function alignOffset(offset: number, byteAlignment: number) {
  return Math.ceil(offset / byteAlignment) * byteAlignment;
}

function readFloat32(relativePath: string) {
  const buffer = readFileSync(join(SCENE_DIR, relativePath));
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

function readInt32(relativePath: string) {
  const buffer = readFileSync(join(SCENE_DIR, relativePath));
  return new Int32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Int32Array.BYTES_PER_ELEMENT);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function quantizeInt16(value: number, label: string) {
  const quantized = Math.round(value);
  if (quantized < -32768 || quantized > 32767) {
    throw new Error(`${label} quantized outside Int16 range: ${quantized}`);
  }
  return quantized;
}

function quantizeUint16(value: number, label: string) {
  const quantized = Math.round(value);
  if (quantized < 0 || quantized > 65535) {
    throw new Error(`${label} quantized outside Uint16 range: ${quantized}`);
  }
  return quantized;
}

function packChunk(asset: OsrsMapSquareAsset) {
  const positions = readFloat32(asset.positions);
  const colors = readFloat32(asset.colors);
  const indices = readInt32(asset.indices);
  const uvs = asset.uvs ? readFloat32(asset.uvs) : undefined;
  const textureIndices = asset.textureIndices ? readFloat32(asset.textureIndices) : undefined;
  const vertexCount = asset.vertexCount;
  const indexCount = asset.indexCount;
  const packedPositions = new Int16Array(vertexCount * 3);
  const packedColors = new Uint8Array(vertexCount * 4);
  const packedUvs = uvs ? new Uint16Array(vertexCount * 2) : undefined;
  const packedTextureIndices = textureIndices ? new Uint16Array(vertexCount) : undefined;
  const packedIndices = new Uint32Array(indexCount);
  const baseX = asset.mapX * MAP_SQUARE_SIZE;
  const baseY = asset.mapY * MAP_SQUARE_SIZE;

  for (let index = 0; index < vertexCount; index += 1) {
    packedPositions[index * 3] = quantizeInt16((positions[index * 3] - baseX) * PACKED_POSITION_SCALE, `${asset.mapX}_${asset.mapY} x`);
    packedPositions[index * 3 + 1] = quantizeInt16(positions[index * 3 + 1] * PACKED_POSITION_SCALE, `${asset.mapX}_${asset.mapY} height`);
    packedPositions[index * 3 + 2] = quantizeInt16((positions[index * 3 + 2] - baseY) * PACKED_POSITION_SCALE, `${asset.mapX}_${asset.mapY} y`);
    packedColors[index * 4] = clamp(Math.round(colors[index * 4] * 255), 0, 255);
    packedColors[index * 4 + 1] = clamp(Math.round(colors[index * 4 + 1] * 255), 0, 255);
    packedColors[index * 4 + 2] = clamp(Math.round(colors[index * 4 + 2] * 255), 0, 255);
    packedColors[index * 4 + 3] = clamp(Math.round(colors[index * 4 + 3] * 255), 0, 255);
  }

  if (uvs && packedUvs) {
    for (let index = 0; index < packedUvs.length; index += 1) {
      packedUvs[index] = quantizeUint16(uvs[index] * PACKED_UV_SCALE, `${asset.mapX}_${asset.mapY} uv`);
    }
  }

  if (textureIndices && packedTextureIndices) {
    for (let index = 0; index < vertexCount; index += 1) {
      packedTextureIndices[index] = quantizeUint16(textureIndices[index], `${asset.mapX}_${asset.mapY} texture index`);
    }
  }

  for (let index = 0; index < indexCount; index += 1) {
    packedIndices[index] = indices[index];
  }

  let flags = 0;
  if (packedUvs) {
    flags |= PACKED_CHUNK_HAS_UVS;
  }
  if (packedTextureIndices) {
    flags |= PACKED_CHUNK_HAS_TEXTURE_INDICES;
  }

  let byteLength = 32 + packedPositions.byteLength + packedColors.byteLength;
  if (packedUvs) {
    byteLength += packedUvs.byteLength;
  }
  if (packedTextureIndices) {
    byteLength += packedTextureIndices.byteLength;
  }
  byteLength = alignOffset(byteLength, 4) + packedIndices.byteLength;

  const output = Buffer.alloc(byteLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  view.setUint32(0, PACKED_CHUNK_MAGIC, true);
  view.setUint32(4, PACKED_CHUNK_VERSION, true);
  view.setUint32(8, flags, true);
  view.setUint32(12, vertexCount, true);
  view.setUint32(16, indexCount, true);

  let offset = 32;
  Buffer.from(packedPositions.buffer, packedPositions.byteOffset, packedPositions.byteLength).copy(output, offset);
  offset += packedPositions.byteLength;
  Buffer.from(packedColors.buffer, packedColors.byteOffset, packedColors.byteLength).copy(output, offset);
  offset += packedColors.byteLength;
  if (packedUvs) {
    Buffer.from(packedUvs.buffer, packedUvs.byteOffset, packedUvs.byteLength).copy(output, offset);
    offset += packedUvs.byteLength;
  }
  if (packedTextureIndices) {
    Buffer.from(packedTextureIndices.buffer, packedTextureIndices.byteOffset, packedTextureIndices.byteLength).copy(output, offset);
    offset += packedTextureIndices.byteLength;
  }
  offset = alignOffset(offset, 4);
  Buffer.from(packedIndices.buffer, packedIndices.byteOffset, packedIndices.byteLength).copy(output, offset);

  const packed = `chunks/${asset.mapX}_${asset.mapY}.chunk.bin`;
  const outputPath = join(SCENE_DIR, packed);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
  return { ...asset, packed };
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as OsrsSceneManifest;
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : manifest.chunks.length;
  let originalBytes = 0;
  let packedBytes = 0;
  const chunks = manifest.chunks.map((asset, index) => {
    if (index >= limit) {
      return asset;
    }

    const nextAsset = packChunk(asset);
    const packedPath = join(SCENE_DIR, nextAsset.packed ?? "");
    const sourcePaths = [asset.positions, asset.colors, asset.indices, asset.uvs, asset.textureIndices].filter(Boolean) as string[];
    originalBytes += sourcePaths.reduce((total, relativePath) => total + readFileSync(join(SCENE_DIR, relativePath)).byteLength, 0);
    packedBytes += readFileSync(packedPath).byteLength;
    if ((index + 1) % 25 === 0 || index + 1 === Math.min(limit, manifest.chunks.length)) {
      console.log(`Packed ${index + 1}/${Math.min(limit, manifest.chunks.length)} chunks`);
    }
    return nextAsset;
  });

  writeFileSync(MANIFEST_PATH, `${JSON.stringify({ ...manifest, chunks }, null, 2)}\n`);
  console.log(
    `Packed ${Math.min(limit, manifest.chunks.length)} chunks: ${(originalBytes / 1024 / 1024).toFixed(1)}MB -> ${(packedBytes / 1024 / 1024).toFixed(1)}MB`
  );
}

main();
