import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TerrainChunk } from "../lib/terrain/types";

const chunk: TerrainChunk = {
  id: "lumbridge-varrock-test",
  baseX: 2944,
  baseY: 3072,
  size: 128,
  tileSize: 4,
  heights: [],
  materials: []
};

const landmarks = [
  { x: 3222, y: 3218, radius: 38, lift: -8 },
  { x: 3210, y: 3424, radius: 58, lift: 12 },
  { x: 3164, y: 3485, radius: 42, lift: 18 },
  { x: 3093, y: 3244, radius: 34, lift: -2 },
  { x: 3293, y: 3174, radius: 44, lift: 8 },
  { x: 3340, y: 3320, radius: 100, lift: 42 },
  { x: 3008, y: 3384, radius: 80, lift: 28 }
];

function distance(xA: number, yA: number, xB: number, yB: number) {
  return Math.hypot(xA - xB, yA - yB);
}

for (let row = 0; row <= chunk.size; row += 1) {
  const heightRow: number[] = [];
  const materialRow: number[] = [];

  for (let col = 0; col <= chunk.size; col += 1) {
    const x = chunk.baseX + col * chunk.tileSize;
    const y = chunk.baseY + row * chunk.tileSize;
    const rollingNoise = Math.sin(x * 0.026) * 10 + Math.cos(y * 0.021) * 12 + Math.sin((x + y) * 0.013) * 8;
    const riverCut = -26 * Math.exp(-Math.pow((x - 3120) / 38, 2)) * Math.exp(-Math.pow((y - 3235) / 185, 2));
    const roadBench = -10 * Math.exp(-Math.pow((x - 3215) / 22, 2)) * Math.exp(-Math.pow((y - 3330) / 230, 2));
    const landmarkLift = landmarks.reduce((total, landmark) => {
      const falloff = Math.exp(-Math.pow(distance(x, y, landmark.x, landmark.y) / landmark.radius, 2));
      return total + landmark.lift * falloff;
    }, 0);
    const northRise = Math.max(0, y - 3350) * 0.08;
    const desertSlope = Math.max(0, x - 3240) * 0.06;
    const height = Math.round(56 + rollingNoise + riverCut + roadBench + landmarkLift + northRise + desertSlope);

    heightRow.push(height);
    materialRow.push(height < 42 ? 2 : x > 3230 && y < 3260 ? 3 : height > 82 ? 4 : 1);
  }

  chunk.heights.push(heightRow);

  if (row < chunk.size) {
    chunk.materials?.push(materialRow.slice(0, chunk.size));
  }
}

const outPath = join(process.cwd(), "data", "terrain", "lumbridge-varrock.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(`${outPath}`, `${JSON.stringify(chunk, null, 2)}\n`);
console.log(`Generated ${outPath}`);
