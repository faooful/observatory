import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import type { OsrsSceneManifest } from "../lib/osrs-scene/types";

const root = process.cwd();
const sceneRoot = resolve(root, "public/osrs-scene/osrs-238_2026-06-03");
const manifestPath = join(sceneRoot, "manifest.json");
const outputTexture = "overview/world/0_0.png";
const canvasWidth = 2048;
const mapSquareSize = 64;

type TileStats = {
  dark: number;
  blue: number;
  land: number;
  bright: number;
  total: number;
};

async function getTileStats(path: string): Promise<TileStats> {
  const { data } = await sharp(path).resize(64, 64).raw().toBuffer({ resolveWithObject: true });
  const stats = { dark: 0, blue: 0, land: 0, bright: 0, total: 0 };

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (alpha < 16) {
      continue;
    }

    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    stats.total += 1;
    if (red + green + blue < 80) {
      stats.dark += 1;
    }
    if (blue > 55 && (green > 45 || red < 80)) {
      stats.blue += 1;
    }
    if (green > 60 && red > 30 && blue < 150) {
      stats.land += 1;
    }
    if (red + green + blue > 180) {
      stats.bright += 1;
    }
  }

  return stats;
}

async function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as OsrsSceneManifest;
  const overviewTiles = manifest.texturePyramid?.levels.find((level) => level.kind === "plane")?.overviewTiles ?? [];

  if (overviewTiles.length === 0) {
    throw new Error("No plane overview tiles found in manifest");
  }

  const rowStats = new Map<number, TileStats & { count: number }>();
  for (const tile of overviewTiles) {
    const stats = await getTileStats(join(sceneRoot, tile.texture));
    const current = rowStats.get(tile.y) ?? { dark: 0, blue: 0, land: 0, bright: 0, total: 0, count: 0 };
    current.dark += stats.dark;
    current.blue += stats.blue;
    current.land += stats.land;
    current.bright += stats.bright;
    current.total += stats.total;
    current.count += 1;
    rowStats.set(tile.y, current);
  }

  const surfaceRows = new Set<number>();
  rowStats.forEach((stats, row) => {
    const darkRatio = stats.dark / Math.max(1, stats.total);
    const brightRatio = stats.bright / Math.max(1, stats.total);
    const landRatio = stats.land / Math.max(1, stats.total);
    if (darkRatio < 0.12 && brightRatio > 0.5 && landRatio > 0.45) {
      surfaceRows.add(row);
    }
  });

  const surfaceTiles = overviewTiles.filter((tile) => surfaceRows.has(tile.y));
  if (surfaceTiles.length === 0) {
    throw new Error("Could not identify surface overview rows");
  }

  const surfaceBounds = {
    minX: manifest.bounds.minX,
    maxX: manifest.bounds.maxX,
    minY: Math.min(...surfaceTiles.map((tile) => tile.mapYMin)) * mapSquareSize,
    maxY: (Math.max(...surfaceTiles.map((tile) => tile.mapYMax)) + 1) * mapSquareSize
  };
  const width = surfaceBounds.maxX - surfaceBounds.minX;
  const depth = surfaceBounds.maxY - surfaceBounds.minY;
  const canvasHeight = Math.round(canvasWidth * (depth / width));
  const composites = await Promise.all(surfaceTiles.map(async (tile) => {
    const minX = tile.mapXMin * mapSquareSize;
    const maxX = (tile.mapXMax + 1) * mapSquareSize;
    const minY = tile.mapYMin * mapSquareSize;
    const maxY = (tile.mapYMax + 1) * mapSquareSize;
    const drawX = Math.round(((minX - surfaceBounds.minX) / width) * canvasWidth);
    const drawY = Math.round(canvasHeight - ((maxY - surfaceBounds.minY) / depth) * canvasHeight);
    const drawWidth = Math.max(1, Math.round(((maxX - minX) / width) * canvasWidth));
    const drawHeight = Math.max(1, Math.round(((maxY - minY) / depth) * canvasHeight));

    return {
      input: await sharp(join(sceneRoot, tile.texture))
        .resize(drawWidth, drawHeight, { fit: "fill" })
        .png()
        .toBuffer(),
      left: drawX,
      top: drawY
    };
  }));

  const outPath = join(sceneRoot, outputTexture);
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 27, g: 51, b: 64, alpha: 1 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const nextManifest = {
    ...manifest,
    bounds: surfaceBounds,
    overview: {
      ...manifest.overview,
      globeTexture: outputTexture,
      planeTexture: outputTexture,
      fullTexture: outputTexture
    },
    texturePyramid: manifest.texturePyramid
      ? {
          ...manifest.texturePyramid,
          atlas: outputTexture,
          levels: manifest.texturePyramid.levels.map((level) =>
            level.kind === "globe"
              ? {
                  ...level,
                  tiles: [outputTexture]
                }
              : level.kind === "plane"
                ? {
                    ...level,
                    tiles: surfaceTiles.map((tile) => tile.texture),
                    overviewTiles: surfaceTiles
                  }
                : level
          )
        }
      : manifest.texturePyramid,
    projection: manifest.projection
      ? {
          ...manifest.projection,
          radius: Math.max(width, depth) * 0.48,
          worldWidth: width,
          worldDepth: depth,
          latitudeLimit: Math.PI * 0.47
        }
      : manifest.projection,
    validMapSquares: manifest.validMapSquares?.filter(
      (coord) => coord.mapY * mapSquareSize >= surfaceBounds.minY && (coord.mapY + 1) * mapSquareSize <= surfaceBounds.maxY
    ),
    chunks: manifest.chunks.filter(
      (chunk) => chunk.mapY * mapSquareSize >= surfaceBounds.minY && (chunk.mapY + 1) * mapSquareSize <= surfaceBounds.maxY
    ),
    lod: manifest.lod
      ? {
          ...manifest.lod,
          globeDistance: Math.max(width, depth) * 1.8,
          planeDistance: Math.max(width, depth) * 1.35
        }
      : manifest.lod
  };

  writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2) + "\n");
  console.log(JSON.stringify({
    outputTexture,
    width: canvasWidth,
    height: canvasHeight,
    surfaceRows: Array.from(surfaceRows).sort((a, b) => a - b),
    surfaceBounds,
    tiles: surfaceTiles.length,
    chunks: nextManifest.chunks.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
