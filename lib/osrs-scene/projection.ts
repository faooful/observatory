import { MathUtils, Vector3 } from "three";
import type { OsrsProjectionSettings, OsrsSceneLodThresholds } from "@/lib/osrs-scene/types";

export const OVERVIEW_PLANE_Y = -2;

export type OsrsWorldPoint = {
  x: number;
  y: number;
};

export type OsrsProjectionBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX?: number;
  centerY?: number;
  width?: number;
  depth?: number;
};

function getBoundsMetrics(bounds: OsrsProjectionBounds) {
  const width = bounds.width ?? bounds.maxX - bounds.minX;
  const depth = bounds.depth ?? bounds.maxY - bounds.minY;
  return {
    width,
    depth,
    centerX: bounds.centerX ?? (bounds.minX + bounds.maxX) / 2,
    centerY: bounds.centerY ?? (bounds.minY + bounds.maxY) / 2
  };
}

function getLatitudeLimit(projection: OsrsProjectionSettings) {
  return projection.latitudeLimit ?? Math.PI * 0.47;
}

export function getSurfacePointFromUv(
  u: number,
  v: number,
  bounds: OsrsProjectionBounds,
  projection: OsrsProjectionSettings | undefined,
  morph: number,
  planeY = OVERVIEW_PLANE_Y,
  target = new Vector3()
) {
  const { centerX, centerY } = getBoundsMetrics(bounds);
  const worldX = MathUtils.lerp(bounds.minX, bounds.maxX, u);
  const worldY = MathUtils.lerp(bounds.maxY, bounds.minY, v);
  const plane = target.set(worldX - centerX, planeY, -(worldY - centerY));

  if (!projection) {
    return plane;
  }

  const latitudeLimit = getLatitudeLimit(projection);
  const latitude = (0.5 - v) * latitudeLimit * 2;
  const longitude = (u - 0.5) * Math.PI * 2;
  const globeX = Math.cos(latitude) * Math.sin(longitude) * projection.radius;
  const globeY = Math.sin(latitude) * projection.radius + projection.radius * 0.18;
  const globeZ = Math.cos(latitude) * Math.cos(longitude) * projection.radius;

  return target.set(
    MathUtils.lerp(globeX, plane.x, morph),
    MathUtils.lerp(globeY, plane.y, morph),
    MathUtils.lerp(globeZ, plane.z, morph)
  );
}

export function mapWorldToSurface(
  worldX: number,
  worldY: number,
  bounds: OsrsProjectionBounds,
  projection: OsrsProjectionSettings | undefined,
  morph: number,
  planeY = 0,
  target = new Vector3()
) {
  const { width, depth } = getBoundsMetrics(bounds);
  const u = MathUtils.clamp((worldX - bounds.minX) / width, 0, 1);
  const v = MathUtils.clamp((bounds.maxY - worldY) / depth, 0, 1);
  return getSurfacePointFromUv(u, v, bounds, projection, morph, planeY, target);
}

export function surfaceToMapWorld(
  point: Vector3,
  bounds: OsrsProjectionBounds,
  projection: OsrsProjectionSettings | undefined,
  morph: number,
  planeY = 0
): OsrsWorldPoint {
  const { centerX, centerY, width, depth } = getBoundsMetrics(bounds);

  if (projection && morph <= 0.001) {
    const radius = projection.radius;
    const latitudeLimit = getLatitudeLimit(projection);
    const normalizedY = MathUtils.clamp((point.y - radius * 0.18) / radius, -1, 1);
    const latitude = MathUtils.clamp(Math.asin(normalizedY), -latitudeLimit, latitudeLimit);
    const longitude = Math.atan2(point.x, point.z);
    const u = MathUtils.clamp(longitude / (Math.PI * 2) + 0.5, 0, 1);
    const v = MathUtils.clamp(0.5 - latitude / (latitudeLimit * 2), 0, 1);

    return {
      x: MathUtils.lerp(bounds.minX, bounds.maxX, u),
      y: MathUtils.lerp(bounds.maxY, bounds.minY, v)
    };
  }

  if (projection && morph < 0.999) {
    const radius = projection.radius;
    const latitudeLimit = getLatitudeLimit(projection);
    const normalizedY = MathUtils.clamp((point.y - radius * 0.18) / radius, -1, 1);
    const latitude = MathUtils.clamp(Math.asin(normalizedY), -latitudeLimit, latitudeLimit);
    const longitude = Math.atan2(point.x, point.z);
    const globeU = MathUtils.clamp(longitude / (Math.PI * 2) + 0.5, 0, 1);
    const globeV = MathUtils.clamp(0.5 - latitude / (latitudeLimit * 2), 0, 1);
    const planeWorldX = MathUtils.clamp(point.x + centerX, bounds.minX, bounds.maxX);
    const planeWorldY = MathUtils.clamp(centerY - point.z, bounds.minY, bounds.maxY);
    const planeU = MathUtils.clamp((planeWorldX - bounds.minX) / width, 0, 1);
    const planeV = MathUtils.clamp((bounds.maxY - planeWorldY) / depth, 0, 1);
    let u = MathUtils.lerp(globeU, planeU, morph);
    let v = MathUtils.lerp(globeV, planeV, morph);
    const epsilon = 0.002;
    const current = new Vector3();
    const uPoint = new Vector3();
    const vPoint = new Vector3();
    const residual = new Vector3();
    const du = new Vector3();
    const dv = new Vector3();

    for (let iteration = 0; iteration < 8; iteration += 1) {
      getSurfacePointFromUv(u, v, bounds, projection, morph, planeY, current);
      getSurfacePointFromUv(MathUtils.clamp(u + epsilon, 0, 1), v, bounds, projection, morph, planeY, uPoint);
      getSurfacePointFromUv(u, MathUtils.clamp(v + epsilon, 0, 1), bounds, projection, morph, planeY, vPoint);
      residual.copy(point).sub(current);
      du.copy(uPoint).sub(current);
      dv.copy(vPoint).sub(current);

      const a = du.dot(du);
      const b = du.dot(dv);
      const c = dv.dot(dv);
      const d = du.dot(residual);
      const e = dv.dot(residual);
      const determinant = a * c - b * b;
      if (Math.abs(determinant) < 1e-8) {
        break;
      }

      const stepU = MathUtils.clamp(((d * c - b * e) / determinant) * epsilon, -0.08, 0.08);
      const stepV = MathUtils.clamp(((a * e - b * d) / determinant) * epsilon, -0.08, 0.08);
      u = MathUtils.clamp(u + stepU, 0, 1);
      v = MathUtils.clamp(v + stepV, 0, 1);
    }

    return {
      x: MathUtils.lerp(bounds.minX, bounds.maxX, u),
      y: MathUtils.lerp(bounds.maxY, bounds.minY, v)
    };
  }

  return {
    x: MathUtils.clamp(point.x + centerX, bounds.minX, bounds.maxX),
    y: MathUtils.clamp(centerY - point.z, bounds.minY, bounds.maxY)
  };
}

export function getProjectionTransition(
  distance: number,
  bounds: OsrsProjectionBounds,
  lod: OsrsSceneLodThresholds | undefined
) {
  const { width, depth } = getBoundsMetrics(bounds);
  const planeDistance = lod?.planeDistance ?? Math.max(width, depth) * 1.35;
  const closeDistance = lod?.closeDistance ?? Math.max(width, depth) * 0.1;
  return 1 - MathUtils.smoothstep(distance, closeDistance * 1.8, planeDistance * 0.72);
}

export function getProjectionMorph(
  distance: number,
  bounds: OsrsProjectionBounds,
  lod: OsrsSceneLodThresholds | undefined
) {
  const transition = getProjectionTransition(distance, bounds, lod);
  return MathUtils.smoothstep(transition, 0.08, 0.78);
}
