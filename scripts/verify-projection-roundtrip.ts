import { readFileSync } from "node:fs";
import { Vector3 } from "three";
import {
  OVERVIEW_PLANE_Y,
  getSurfacePointFromUv,
  mapWorldToSurface,
  surfaceToMapWorld
} from "../lib/osrs-scene/projection";
import type { OsrsSceneManifest } from "../lib/osrs-scene/types";

const manifest = JSON.parse(
  readFileSync("public/osrs-scene/osrs-238_2026-06-03/manifest.json", "utf8")
) as OsrsSceneManifest;

const bounds = manifest.bounds;
const projection = manifest.projection;

if (!projection) {
  throw new Error("Manifest is missing projection settings");
}

const morphSamples = [0, 0.02, 0.1, 0.25, 0.5, 0.75, 0.95, 1];
const worldXSamples = [
  bounds.minX + (bounds.maxX - bounds.minX) * 0.08,
  bounds.minX + (bounds.maxX - bounds.minX) * 0.38,
  3244.43,
  bounds.minX + (bounds.maxX - bounds.minX) * 0.92
];
const worldYSamples = [
  bounds.minY + (bounds.maxY - bounds.minY) * 0.1,
  2901.82,
  bounds.minY + (bounds.maxY - bounds.minY) * 0.62,
  bounds.minY + (bounds.maxY - bounds.minY) * 0.9
];
const surfacePoint = new Vector3();
let worstError = 0;
let worstFallbackAnchorMagnitude = 0;
let worstCase:
  | {
      morph: number;
      expected: { x: number; y: number };
      actual: { x: number; y: number };
      error: number;
    }
  | undefined;

for (const morph of morphSamples) {
  for (const worldX of worldXSamples) {
    for (const worldY of worldYSamples) {
      const u = (worldX - bounds.minX) / (bounds.maxX - bounds.minX);
      const v = (bounds.maxY - worldY) / (bounds.maxY - bounds.minY);
      getSurfacePointFromUv(u, v, bounds, projection, morph, OVERVIEW_PLANE_Y, surfacePoint);
      const actual = surfaceToMapWorld(surfacePoint, bounds, projection, morph, OVERVIEW_PLANE_Y);
      const error = Math.hypot(actual.x - worldX, actual.y - worldY);

      if (error > worstError) {
        worstError = error;
        worstCase = {
          morph,
          expected: { x: worldX, y: worldY },
          actual,
          error
        };
      }

      const offSurfaceTarget = surfacePoint.clone();
      offSurfaceTarget.y += 51459361.835769184;
      const fallbackWorld = surfaceToMapWorld(offSurfaceTarget, bounds, projection, morph, OVERVIEW_PLANE_Y);
      const fallbackAnchor = mapWorldToSurface(
        fallbackWorld.x,
        fallbackWorld.y,
        bounds,
        projection,
        morph,
        OVERVIEW_PLANE_Y
      );
      const fallbackAnchorMagnitude = Math.max(
        Math.abs(fallbackAnchor.x),
        Math.abs(fallbackAnchor.y),
        Math.abs(fallbackAnchor.z)
      );

      if (fallbackAnchorMagnitude > worstFallbackAnchorMagnitude) {
        worstFallbackAnchorMagnitude = fallbackAnchorMagnitude;
      }
    }
  }
}

console.log(JSON.stringify({ worstError, worstFallbackAnchorMagnitude, worstCase }, null, 2));

if (worstError > 0.01) {
  throw new Error(`Projection round-trip error ${worstError.toFixed(6)} exceeds tolerance`);
}

if (worstFallbackAnchorMagnitude > projection.radius * 1.3) {
  throw new Error(`Fallback anchor magnitude ${worstFallbackAnchorMagnitude.toFixed(6)} exceeds tolerance`);
}
