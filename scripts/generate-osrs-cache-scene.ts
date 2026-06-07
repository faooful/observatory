import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO_URL = "https://github.com/dennisdev/rs-map-viewer.git";
const CACHE_ID = 2565;
const CACHE_NAME = "osrs-238_2026-06-03";
const CACHE_VERSION = "osrs-238_2026-06-03";
const MAP_X_MIN = 48;
const MAP_X_MAX = 53;
const MAP_Y_MIN = 43;
const MAP_Y_MAX = 50;

const root = process.cwd();
const cacheRoot = resolve(root, ".cache");
const rsRepo = join(cacheRoot, "rs-map-viewer");
const exportScriptPath = join(rsRepo, "scripts", "cache", "export-observatory-scene.ts");
const outputDir = join(root, "public", "osrs-scene", CACHE_VERSION);

function run(command: string, args: string[], cwd = root) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function ensureRepo() {
  mkdirSync(cacheRoot, { recursive: true });

  if (!existsSync(join(rsRepo, ".git"))) {
    run("git", ["clone", "--depth", "1", REPO_URL, rsRepo]);
  }

  if (!existsSync(join(rsRepo, "node_modules"))) {
    run("npm", ["install", "--ignore-scripts", "--legacy-peer-deps"], rsRepo);
  }
}

function writeExportScript() {
  const script = String.raw`
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { deflateSync } from "zlib";
import AdmZip from "adm-zip";

import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { detectCacheType } from "../../src/rs/cache/CacheType";
import { CacheFiles } from "../../src/rs/cache/CacheFiles";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { LocModelLoader } from "../../src/rs/config/loctype/LocModelLoader";
import { ObjModelLoader } from "../../src/rs/config/objtype/ObjModelLoader";
import { NpcModelLoader } from "../../src/rs/config/npctype/NpcModelLoader";
import { VarManager } from "../../src/rs/config/vartype/VarManager";
import { Scene } from "../../src/rs/scene/Scene";
import { LocLoadType, SceneBuilder } from "../../src/rs/scene/SceneBuilder";
import { HSL_RGB_MAP } from "../../src/rs/util/ColorUtil";
import { LoadedCache } from "../../src/mapviewer/Caches";
import { SdMapDataLoader } from "../../src/mapviewer/webgl/loader/SdMapDataLoader";
import { SdMapLoaderInput } from "../../src/mapviewer/webgl/loader/SdMapLoaderInput";
import { WorkerState } from "../../src/mapviewer/worker/RenderDataWorker";
import { MapImageRenderer } from "../../src/rs/map/MapImageRenderer";

(globalThis as any).ImageData ??= class ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }

    this.data = dataOrWidth;
    this.width = widthOrHeight;
    this.height = height ?? 0;
  }
};

(globalThis as any).OffscreenCanvas ??= class OffscreenCanvas {
  constructor(readonly width: number, readonly height: number) {}
  getContext() {
    return { putImageData() {} };
  }
  async convertToBlob() {
    return new Blob([]);
  }
};

const CACHE_ID = ${CACHE_ID};
const CACHE_NAME = "${CACHE_NAME}";
const CACHE_VERSION = "${CACHE_VERSION}";
const OUTPUT_DIR = ${JSON.stringify(outputDir)};
const MAP_X_MIN = ${MAP_X_MIN};
const MAP_X_MAX = ${MAP_X_MAX};
const MAP_Y_MIN = ${MAP_Y_MIN};
const MAP_Y_MAX = ${MAP_Y_MAX};
const CACHE_DIR = join(process.cwd(), "caches", CACHE_NAME);

type ExportMesh = {
  mapX: number;
  mapY: number;
  vertexCount: number;
  indexCount: number;
  positions: string;
  colors: string;
  indices: string;
};

type PngImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

function getCacheInfo() {
  return {
    id: CACHE_ID,
    scope: "runescape",
    game: "oldschool",
    environment: "live",
    language: "en",
    builds: [{ major: 238 }],
    timestamp: "2026-06-03T13:45:06.049779Z",
    name: CACHE_NAME,
    revision: 238,
  } as any;
}

async function ensureCache() {
  if (existsSync(join(CACHE_DIR, "info.json")) && existsSync(join(CACHE_DIR, "keys.json"))) {
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  console.log("Downloading OpenRS2 cache", CACHE_ID);
  const diskResp = await fetch("https://archive.openrs2.org/caches/runescape/" + CACHE_ID + "/disk.zip");
  if (!diskResp.ok) {
    throw new Error("Failed downloading disk.zip: " + diskResp.status);
  }
  const diskZip = new AdmZip(Buffer.from(await diskResp.arrayBuffer()));
  diskZip.extractEntryTo("cache/", CACHE_DIR, false, true);

  const keysResp = await fetch("https://archive.openrs2.org/caches/runescape/" + CACHE_ID + "/keys.json");
  if (!keysResp.ok) {
    throw new Error("Failed downloading keys.json: " + keysResp.status);
  }
  const keys = await keysResp.json();
  const xteas: Record<string, number[]> = {};
  for (const entry of keys as Array<{ group: number; key: number[] }>) {
    xteas[String(entry.group)] = entry.key;
  }

  writeFileSync(join(CACHE_DIR, "keys.json"), JSON.stringify(xteas), "utf8");
  writeFileSync(join(CACHE_DIR, "info.json"), JSON.stringify(getCacheInfo()), "utf8");
}

function loadCacheFiles(): CacheFiles {
  const files = new Map<string, ArrayBuffer>();

  readdirSync(CACHE_DIR).forEach((fileName: string) => {
    if (fileName === "info.json" || fileName === "keys.json") {
      return;
    }
    const buffer = readFileSync(join(CACHE_DIR, fileName));
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(buffer);
    files.set(fileName, arrayBuffer);
  });

  return new CacheFiles(files);
}

function loadCache(): LoadedCache {
  const info = JSON.parse(readFileSync(join(CACHE_DIR, "info.json"), "utf8"));
  const xteaJson: Record<string, number[]> = JSON.parse(readFileSync(join(CACHE_DIR, "keys.json"), "utf8"));
  const files = loadCacheFiles();
  return {
    info,
    type: detectCacheType(info),
    files,
    xteas: new Map(Object.keys(xteaJson).map((key) => [Number(key), xteaJson[key]])),
  };
}

async function createWorkerState(cache: LoadedCache): Promise<WorkerState> {
  const cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);
  const loaderFactory = getCacheLoaderFactory(cache.info, cacheSystem);
  const underlayTypeLoader = loaderFactory.getUnderlayTypeLoader();
  const overlayTypeLoader = loaderFactory.getOverlayTypeLoader();
  const varBitTypeLoader = loaderFactory.getVarBitTypeLoader();
  const locTypeLoader = loaderFactory.getLocTypeLoader();
  const objTypeLoader = loaderFactory.getObjTypeLoader();
  const npcTypeLoader = loaderFactory.getNpcTypeLoader();
  const basTypeLoader = loaderFactory.getBasTypeLoader();
  const modelLoader = loaderFactory.getModelLoader();
  const textureLoader = loaderFactory.getTextureLoader();
  const seqTypeLoader = loaderFactory.getSeqTypeLoader();
  const seqFrameLoader = loaderFactory.getSeqFrameLoader();
  const skeletalSeqLoader = loaderFactory.getSkeletalSeqLoader();
  const mapFileLoader = loaderFactory.getMapFileLoader();
  const varManager = new VarManager(varBitTypeLoader);
  const questTypeLoader = loaderFactory.getQuestTypeLoader();

  if (questTypeLoader) {
    varManager.setQuestsCompleted(questTypeLoader);
  }

  const locModelLoader = new LocModelLoader(
    locTypeLoader,
    modelLoader,
    textureLoader,
    seqTypeLoader,
    seqFrameLoader,
    skeletalSeqLoader,
  );
  const objModelLoader = new ObjModelLoader(objTypeLoader, modelLoader, textureLoader);
  const npcModelLoader = new NpcModelLoader(
    npcTypeLoader,
    modelLoader,
    textureLoader,
    seqTypeLoader,
    seqFrameLoader,
    skeletalSeqLoader,
    varManager,
  );
  const sceneBuilder = new SceneBuilder(
    cache.info,
    mapFileLoader,
    underlayTypeLoader,
    overlayTypeLoader,
    locTypeLoader,
    locModelLoader,
    cache.xteas,
  );
  const mapImageRenderer = new MapImageRenderer(
    textureLoader,
    locTypeLoader,
    loaderFactory.getMapScenes(),
    loaderFactory.getMapFunctions(),
  );

  return {
    cache,
    cacheSystem,
    cacheLoaderFactory: loaderFactory,
    locTypeLoader,
    objTypeLoader,
    npcTypeLoader,
    seqTypeLoader,
    basTypeLoader,
    textureLoader,
    seqFrameLoader,
    skeletalSeqLoader,
    locModelLoader,
    objModelLoader,
    npcModelLoader,
    sceneBuilder,
    varManager,
    mapImageRenderer,
    mapImageCache: undefined as any,
    objSpawns: [],
    npcSpawns: [],
  };
}

function hslToRgb(hsl: number, isTextured: boolean) {
  if (isTextured) {
    const light = Math.max(0.18, Math.min(1, (hsl & 0x7f) / 110));
    return [light, light, light];
  }

  const rgb = HSL_RGB_MAP[hsl & 0xffff] || 0x404040;
  return [
    ((rgb >> 16) & 255) / 255,
    ((rgb >> 8) & 255) / 255,
    (rgb & 255) / 255,
  ];
}

function decodeMesh(mapX: number, mapY: number, vertices: Uint8Array, indices: Int32Array): ExportMesh {
  const vertexCount = Math.floor(vertices.byteLength / 12);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const view = new DataView(vertices.buffer, vertices.byteOffset, vertices.byteLength);

  for (let index = 0; index < vertexCount; index += 1) {
    const byteOffset = index * 12;
    const v0 = view.getUint32(byteOffset, true);
    const v1 = view.getUint32(byteOffset + 4, true);
    const v2 = view.getUint32(byteOffset + 8, true);
    const localX = ((v0 >>> 17) & 0x7fff) - 0x4000;
    const localY = -((v1 & 0x7fff) - 0x4000);
    const localZ = ((v2 >>> 17) & 0x7fff) - 0x4000;
    const hsl = (v1 >>> 15) & 0xffff;
    const isTextured = ((v1 >>> 31) & 0x1) === 1;
    const alpha = ((v2 >>> 9) & 0xff) / 255;
    const [r, g, b] = hslToRgb(hsl, isTextured);

    positions[index * 3] = mapX * Scene.MAP_SQUARE_SIZE + localX / 128;
    positions[index * 3 + 1] = -localY / 128;
    positions[index * 3 + 2] = mapY * Scene.MAP_SQUARE_SIZE + localZ / 128;
    colors[index * 4] = r;
    colors[index * 4 + 1] = g;
    colors[index * 4 + 2] = b;
    colors[index * 4 + 3] = alpha;
  }

  return {
    mapX,
    mapY,
    vertexCount,
    indexCount: indices.length,
    positions: "chunks/" + mapX + "_" + mapY + ".positions.bin",
    colors: "chunks/" + mapX + "_" + mapY + ".colors.bin",
    indices: "chunks/" + mapX + "_" + mapY + ".indices.bin",
  };
}

function writeBinary(relativePath: string, array: ArrayBufferView) {
  const outPath = join(OUTPUT_DIR, relativePath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(array.buffer, array.byteOffset, array.byteLength));
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer: Uint8Array) {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    value = CRC_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  Buffer.from(data).copy(chunk, 8);
  chunk.writeUInt32BE(crc32(new Uint8Array(Buffer.concat([typeBytes, Buffer.from(data)]))), 8 + data.length);
  return chunk;
}

function writePng(relativePath: string, image: PngImage) {
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (image.width * 4 + 1);
    raw[rowOffset] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + y * image.width * 4, image.width * 4).copy(raw, rowOffset + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", new Uint8Array()),
  ]);

  const outPath = join(OUTPUT_DIR, relativePath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);
}

function downsample2x(image: PngImage): PngImage {
  const width = Math.max(1, Math.floor(image.width / 2));
  const height = Math.max(1, Math.floor(image.height / 2));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      const samples = [
        ((y * 2) * image.width + x * 2) * 4,
        ((y * 2) * image.width + Math.min(x * 2 + 1, image.width - 1)) * 4,
        ((Math.min(y * 2 + 1, image.height - 1)) * image.width + x * 2) * 4,
        ((Math.min(y * 2 + 1, image.height - 1)) * image.width + Math.min(x * 2 + 1, image.width - 1)) * 4,
      ];
      for (let channel = 0; channel < 4; channel += 1) {
        data[out + channel] = Math.round(samples.reduce((sum, sample) => sum + image.data[sample + channel], 0) / samples.length);
      }
    }
  }
  return { width, height, data };
}

function cropImage(image: PngImage, x: number, y: number, width: number, height: number): PngImage {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const source = ((y + row) * image.width + x) * 4;
    const target = row * width * 4;
    data.set(image.data.subarray(source, source + width * 4), target);
  }
  return { width, height, data };
}

function renderMapSquareImage(state: WorkerState, mapX: number, mapY: number): PngImage {
  const borderSize = 6;
  const baseX = mapX * Scene.MAP_SQUARE_SIZE - borderSize;
  const baseY = mapY * Scene.MAP_SQUARE_SIZE - borderSize;
  const mapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;
  const scene = state.sceneBuilder.buildScene(baseX, baseY, mapSize, mapSize, false, LocLoadType.NO_MODELS);
  const pixels = state.mapImageRenderer.renderMinimapHd(scene, 0, true);
  const sourceWidth = scene.sizeX * 4;
  const cropOffset = borderSize * 4;
  const width = Scene.MAP_SQUARE_SIZE * 4;
  const height = Scene.MAP_SQUARE_SIZE * 4;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = pixels[(y + cropOffset) * sourceWidth + x + cropOffset] || 0;
      const target = (y * width + x) * 4;
      data[target] = (pixel >> 16) & 255;
      data[target + 1] = (pixel >> 8) & 255;
      data[target + 2] = pixel & 255;
      data[target + 3] = 255;
    }
  }

  return { width, height, data };
}

function writeOverviewAssets(state: WorkerState) {
  const overviewDir = join(OUTPUT_DIR, "overview");
  mkdirSync(overviewDir, { recursive: true });
  const squareSize = Scene.MAP_SQUARE_SIZE * 4;
  const columns = MAP_X_MAX - MAP_X_MIN + 1;
  const rows = MAP_Y_MAX - MAP_Y_MIN + 1;
  const atlas: PngImage = {
    width: columns * squareSize,
    height: rows * squareSize,
    data: new Uint8Array(columns * rows * squareSize * squareSize * 4),
  };

  for (let mapX = MAP_X_MIN; mapX <= MAP_X_MAX; mapX += 1) {
    for (let mapY = MAP_Y_MIN; mapY <= MAP_Y_MAX; mapY += 1) {
      const tile = renderMapSquareImage(state, mapX, mapY);
      const column = mapX - MAP_X_MIN;
      const row = MAP_Y_MAX - mapY;
      for (let y = 0; y < squareSize; y += 1) {
        const source = y * squareSize * 4;
        const target = ((row * squareSize + y) * atlas.width + column * squareSize) * 4;
        atlas.data.set(tile.data.subarray(source, source + squareSize * 4), target);
      }
    }
  }

  writePng("overview/atlas.png", atlas);
  let globe = atlas;
  while (globe.width > 1024 || globe.height > 1024) {
    globe = downsample2x(globe);
  }
  writePng("overview/globe/0/0_0.png", globe);
  writePng("overview/plane/0/0_0.png", atlas);

  const half = downsample2x(atlas);
  writePng("overview/plane/1/0_0.png", cropImage(half, 0, 0, Math.floor(half.width / 2), Math.floor(half.height / 2)));
  writePng("overview/plane/1/1_0.png", cropImage(half, Math.floor(half.width / 2), 0, half.width - Math.floor(half.width / 2), Math.floor(half.height / 2)));
  writePng("overview/plane/1/0_1.png", cropImage(half, 0, Math.floor(half.height / 2), Math.floor(half.width / 2), half.height - Math.floor(half.height / 2)));
  writePng("overview/plane/1/1_1.png", cropImage(half, Math.floor(half.width / 2), Math.floor(half.height / 2), half.width - Math.floor(half.width / 2), half.height - Math.floor(half.height / 2)));
}

async function exportScene() {
  await ensureCache();
  mkdirSync(join(OUTPUT_DIR, "chunks"), { recursive: true });

  const cache = loadCache();
  const state = await createWorkerState(cache);
  writeOverviewAssets(state);
  const loader = new SdMapDataLoader();
  loader.init();
  const chunks: ExportMesh[] = [];

  for (let mapX = MAP_X_MIN; mapX <= MAP_X_MAX; mapX += 1) {
    for (let mapY = MAP_Y_MIN; mapY <= MAP_Y_MAX; mapY += 1) {
      const input: SdMapLoaderInput = {
        mapX,
        mapY,
        maxLevel: 0,
        loadObjs: false,
        loadNpcs: false,
        smoothTerrain: true,
        minimizeDrawCalls: true,
        loadedTextureIds: new Set<number>(),
      };
      const result = await loader.load(state, input);
      if (!result.data) {
        console.warn("No scene data", mapX, mapY);
        continue;
      }

      const chunk = decodeMesh(mapX, mapY, result.data.vertices, result.data.indices);

      const positions = new Float32Array(chunk.vertexCount * 3);
      const colors = new Float32Array(chunk.vertexCount * 4);
      const view = new DataView(result.data.vertices.buffer, result.data.vertices.byteOffset, result.data.vertices.byteLength);
      for (let index = 0; index < chunk.vertexCount; index += 1) {
        const byteOffset = index * 12;
        const v0 = view.getUint32(byteOffset, true);
        const v1 = view.getUint32(byteOffset + 4, true);
        const v2 = view.getUint32(byteOffset + 8, true);
        const localX = ((v0 >>> 17) & 0x7fff) - 0x4000;
        const localY = -((v1 & 0x7fff) - 0x4000);
        const localZ = ((v2 >>> 17) & 0x7fff) - 0x4000;
        const hsl = (v1 >>> 15) & 0xffff;
        const isTextured = ((v1 >>> 31) & 0x1) === 1;
        const alpha = ((v2 >>> 9) & 0xff) / 255;
        const [r, g, b] = hslToRgb(hsl, isTextured);

        positions[index * 3] = mapX * Scene.MAP_SQUARE_SIZE + localX / 128;
        positions[index * 3 + 1] = -localY / 128;
        positions[index * 3 + 2] = mapY * Scene.MAP_SQUARE_SIZE + localZ / 128;
        colors[index * 4] = r;
        colors[index * 4 + 1] = g;
        colors[index * 4 + 2] = b;
        colors[index * 4 + 3] = alpha;
      }

      writeBinary(chunk.positions, positions);
      writeBinary(chunk.colors, colors);
      writeBinary(chunk.indices, result.data.indices);
      chunks.push(chunk);
      console.log("Exported", mapX, mapY, chunk.vertexCount, chunk.indexCount);
    }
  }

  const manifest = {
    cacheName: CACHE_NAME,
    cacheId: CACHE_ID,
    revision: 238,
    bounds: {
      minX: MAP_X_MIN * Scene.MAP_SQUARE_SIZE,
      maxX: (MAP_X_MAX + 1) * Scene.MAP_SQUARE_SIZE,
      minY: MAP_Y_MIN * Scene.MAP_SQUARE_SIZE,
      maxY: (MAP_Y_MAX + 1) * Scene.MAP_SQUARE_SIZE,
    },
    overview: {
      globeTexture: "overview/globe/0/0_0.png",
      planeTexture: "overview/plane/0/0_0.png",
    },
    texturePyramid: {
      atlas: "overview/atlas.png",
      tileSize: Scene.MAP_SQUARE_SIZE * 4,
      columns: MAP_X_MAX - MAP_X_MIN + 1,
      rows: MAP_Y_MAX - MAP_Y_MIN + 1,
      levels: [
        { id: "globe-0", kind: "globe", tiles: ["overview/globe/0/0_0.png"] },
        { id: "plane-0", kind: "plane", tiles: ["overview/plane/0/0_0.png"] },
        {
          id: "plane-1",
          kind: "plane",
          tiles: [
            "overview/plane/1/0_0.png",
            "overview/plane/1/1_0.png",
            "overview/plane/1/0_1.png",
            "overview/plane/1/1_1.png",
          ],
        },
      ],
    },
    projection: {
      type: "globe-to-plane",
      radius: Math.max((MAP_X_MAX - MAP_X_MIN + 1) * Scene.MAP_SQUARE_SIZE, (MAP_Y_MAX - MAP_Y_MIN + 1) * Scene.MAP_SQUARE_SIZE) * 0.48,
      worldWidth: (MAP_X_MAX - MAP_X_MIN + 1) * Scene.MAP_SQUARE_SIZE,
      worldDepth: (MAP_Y_MAX - MAP_Y_MIN + 1) * Scene.MAP_SQUARE_SIZE,
    },
    validMapSquares: Array.from({ length: (MAP_X_MAX - MAP_X_MIN + 1) * (MAP_Y_MAX - MAP_Y_MIN + 1) }, (_, index) => ({
      mapX: MAP_X_MIN + (index % (MAP_X_MAX - MAP_X_MIN + 1)),
      mapY: MAP_Y_MIN + Math.floor(index / (MAP_X_MAX - MAP_X_MIN + 1)),
    })),
    lod: {
      globeDistance: 1650,
      planeDistance: 1280,
      closeDistance: 520,
      closeChunkRadius: 2,
    },
    defaultCamera: {
      x: 3244.43,
      y: 26,
      z: 2901.82,
      pitch: -171,
      yaw: 856,
      projection: "orthographic",
      zoom: 18,
    },
    chunks,
  };

  writeFileSync(join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

exportScene().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  mkdirSync(dirname(exportScriptPath), { recursive: true });
  writeFileSync(exportScriptPath, script);
}

function main() {
  ensureRepo();
  writeExportScript();
  rmSync(outputDir, { recursive: true, force: true });
  run("npx", ["tsx", "scripts/cache/export-observatory-scene.ts"], rsRepo);
}

main();
