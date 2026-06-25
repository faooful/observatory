"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Camera } from "three";
import { MathUtils, Material, Object3D, Raycaster, Vector2, Vector3 } from "three";
import { useMapStore } from "@/lib/store/useMapStore";
import type { OsrsProjectionSettings, OsrsSceneLodThresholds } from "@/lib/osrs-scene/types";
import {
  OVERVIEW_PLANE_Y,
  getProjectionMorph,
  getSurfacePointFromUv,
  mapWorldToSurface,
  surfaceToMapWorld
} from "@/lib/osrs-scene/projection";
import type { OsrsWorldPoint } from "@/lib/osrs-scene/projection";
import type { TerrainBounds } from "@/lib/terrain/loadTerrain";

type CameraPin = {
  id: string;
  x: number;
  y: number;
};

type CameraRigProps = {
  bounds: TerrainBounds;
  pins: CameraPin[];
  defaultTarget?: [number, number, number];
  defaultWorldTarget?: { x: number; y: number };
  projection?: OsrsProjectionSettings;
  lod?: OsrsSceneLodThresholds;
};

type CameraPhase = "globe" | "transition" | "local";

const SETTLE_DELAY_MS = 360;
const WHEEL_SETTLE_DELAY_MS = 1600;
const MIN_FLIGHT_MS = 1250;
const MAX_FLIGHT_MS = 2600;
const WHEEL_ZOOM_SENSITIVITY = 0.00062;
const MAX_WHEEL_ZOOM_STEP = 0.065;
const IDLE_SPIN_DELAY_MS = 1100;
const IDLE_SPIN_SPEED = 0.035;
const LOCAL_MAP_DIRECTION_Y = 0.78;
const WHEEL_UI_BLOCK_SELECTOR = ".sidebar, .overlay-shell, .activity-dock, .right-panel";

type CameraFlight = {
  startedAt: number;
  duration: number;
  fromPosition: Vector3;
  fromTarget: Vector3;
  apexPosition: Vector3;
  apexTarget: Vector3;
  toPosition: Vector3;
  toTarget: Vector3;
};

type MapSurfaceHit = {
  intersection: {
    distance: number;
    face?: { normal: Vector3 } | null;
    object: Object3D;
    point: Vector3;
  };
  facing: number;
  priority: number;
  surface: Object3D;
};

type ObservatoryDebugWindow = Window & {
  __OBSERVATORY_CAMERA__?: {
    directionY: number;
    distance: number;
    globeBlend: number;
    position: [number, number, number];
    target: [number, number, number];
    wheelEvents: number;
    wheelHits: number;
    wheelFallbacks: number;
    wheelDelta: number;
    projectionMorph: number;
    compassAngle: number;
    phase: CameraPhase;
    lastWheelAnchorWorld?: [number, number];
    lastWheelAnchorCorrection?: [number, number, number];
  };
};

function getCameraPhase(distance: number, radius: number): CameraPhase {
  if (distance >= radius * 2.15) {
    return "globe";
  }

  if (distance >= radius * 0.52) {
    return "transition";
  }

  return "local";
}

function getMapViewBlend(distance: number, radius: number) {
  return 1 - MathUtils.smoothstep(distance, radius * 0.44, radius * 2.35);
}

function getWheelMapAngleBlend(distance: number, radius: number, morph: number) {
  return Math.max(
    MathUtils.smoothstep(morph, 0.06, 0.72),
    1 - MathUtils.smoothstep(distance, radius * 2.18, radius * 3.35)
  );
}

function getWheelGlobeBlend(distance: number, radius: number, morph: number) {
  return Math.max(
    1 - MathUtils.smoothstep(morph, 0.04, 0.68),
    MathUtils.smoothstep(distance, radius * 2.15, radius * 3.15)
  );
}

function getDirectionWithVertical(source: Vector3, vertical: number, target = new Vector3()) {
  const y = MathUtils.clamp(vertical, 0.05, 0.98);
  const horizontal = Math.sqrt(1 - y * y);
  target.set(source.x, 0, source.z);

  if (target.lengthSq() < 0.0001) {
    target.set(0, 0, 1);
  }

  return target.normalize().multiplyScalar(horizontal).setY(y);
}

function getWrappedAngleDelta(nextAngle: number, currentAngle: number) {
  return Math.atan2(Math.sin(nextAngle - currentAngle), Math.cos(nextAngle - currentAngle));
}

function getGlobeCenter(projection: OsrsProjectionSettings | undefined, target = new Vector3()) {
  const radius = projection?.radius ?? 0;
  return target.set(0, radius * 0.18, 0);
}

function getGlobeCameraPosition(surfacePoint: Vector3, projection: OsrsProjectionSettings | undefined, distance: number) {
  const center = getGlobeCenter(projection);
  const direction = surfacePoint.clone().sub(center);

  if (direction.lengthSq() < 0.001) {
    direction.set(0.36, 0.44, 1);
  }

  return center.add(direction.normalize().multiplyScalar(distance));
}

function easeInOutQuint(value: number) {
  return value < 0.5
    ? 16 * value * value * value * value * value
    : 1 - Math.pow(-2 * value + 2, 5) / 2;
}

function easeOutQuart(value: number) {
  return 1 - Math.pow(1 - value, 4);
}

function bezierPoint(from: Vector3, apex: Vector3, to: Vector3, progress: number, target: Vector3) {
  const inverse = 1 - progress;
  return target
    .copy(from)
    .multiplyScalar(inverse * inverse)
    .addScaledVector(apex, 2 * inverse * progress)
    .addScaledVector(to, progress * progress);
}

function findMapSurface(object: Object3D | null) {
  let current = object;
  while (current) {
    if (current.userData.mapSurface) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function getObjectOpacity(object: Object3D) {
  const material = "material" in object ? object.material : undefined;
  if (Array.isArray(material)) {
    return material.reduce((maxOpacity, nextMaterial) => Math.max(maxOpacity, getMaterialOpacity(nextMaterial)), 0);
  }
  return getMaterialOpacity(material);
}

function getMaterialOpacity(material: unknown) {
  if (material instanceof Material) {
    return material.transparent ? material.opacity : 1;
  }
  return 1;
}

function getFacingAmount(hitObject: Object3D, faceNormal: Vector3 | undefined, point: Vector3, cameraPosition: Vector3) {
  if (!faceNormal) {
    return 1;
  }

  const normal = faceNormal.clone().transformDirection(hitObject.matrixWorld);
  const toCamera = cameraPosition.clone().sub(point).normalize();
  return normal.dot(toCamera);
}

function isWheelFromUi(event: WheelEvent) {
  return event.target instanceof Element && Boolean(event.target.closest(WHEEL_UI_BLOCK_SELECTOR));
}

function correctCameraForCursorAnchor(
  sourceCamera: Camera,
  position: Vector3,
  target: Vector3,
  anchor: Vector3,
  ndc: Vector2,
  scratchCamera: Camera,
  projectedScratch: Vector3,
  desiredScratch: Vector3,
  strength = 1
) {
  if (strength <= 0) {
    return;
  }

  scratchCamera.copy(sourceCamera);
  scratchCamera.position.copy(position);
  scratchCamera.up.copy(sourceCamera.up);
  scratchCamera.lookAt(target);
  scratchCamera.updateMatrixWorld(true);

  projectedScratch.copy(anchor).project(scratchCamera);
  if (
    !Number.isFinite(projectedScratch.x) ||
    !Number.isFinite(projectedScratch.y) ||
    !Number.isFinite(projectedScratch.z)
  ) {
    return;
  }

  desiredScratch.set(ndc.x, ndc.y, projectedScratch.z).unproject(scratchCamera);
  desiredScratch.subVectors(anchor, desiredScratch).multiplyScalar(MathUtils.clamp(strength, 0, 1));
  position.add(desiredScratch);
  target.add(desiredScratch);
}

export function CameraRig({ bounds, pins, defaultTarget = [0, 0, 0], defaultWorldTarget, projection, lod }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const controls = useRef<CameraControlsImpl | null>(null);
  const targetScratch = useRef(new Vector3());
  const positionScratch = useRef(new Vector3());
  const flightPositionScratch = useRef(new Vector3());
  const flightTargetScratch = useRef(new Vector3());
  const wheelPointerScratch = useRef(new Vector2());
  const wheelRaycaster = useRef(new Raycaster());
  const wheelPositionScratch = useRef(new Vector3());
  const wheelTargetScratch = useRef(new Vector3());
  const wheelAnchor = useRef(new Vector3());
  const wheelNextAnchorScratch = useRef(new Vector3());
  const wheelAnchorNdc = useRef(new Vector2());
  const wheelDirectionScratch = useRef(new Vector3());
  const wheelSettledDirectionScratch = useRef(new Vector3());
  const wheelProjectedScratch = useRef(new Vector3());
  const wheelDesiredScratch = useRef(new Vector3());
  const wheelGlobeAnchorScratch = useRef(new Vector3());
  const wheelGlobeCenterScratch = useRef(new Vector3());
  const wheelGlobeDirectionScratch = useRef(new Vector3());
  const wheelGlobePositionScratch = useRef(new Vector3());
  const wheelCameraScratch = useRef(camera.clone());
  const compassOriginScratch = useRef(new Vector3());
  const compassNorthScratch = useRef(new Vector3());
  const compassOriginNdcScratch = useRef(new Vector3());
  const compassNorthNdcScratch = useRef(new Vector3());
  const lastCompassAngle = useRef(0);
  const lastWheelAnchorWorld = useRef<OsrsWorldPoint | null>(null);
  const lastWheelAnchorCorrection = useRef(new Vector3());
  const cameraTargetWorld = useRef<OsrsWorldPoint>(
    defaultWorldTarget ?? {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    }
  );
  const wheelZoomDelta = useRef(0);
  const wheelEvents = useRef(0);
  const wheelHits = useRef(0);
  const wheelFallbacks = useRef(0);
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const focusRequest = useMapStore((state) => state.focusRequest);
  const viewVersion = useMapStore((state) => state.viewVersion);
  const rotationRequest = useMapStore((state) => state.rotationRequest);
  const activeRadius = Math.max(bounds.width, bounds.depth);
  const initialGlobeSurfacePoint = useMemo(() => {
    if (!defaultWorldTarget) {
      return new Vector3(...defaultTarget);
    }
    return mapWorldToSurface(defaultWorldTarget.x, defaultWorldTarget.y, bounds, projection, 0);
  }, [bounds, defaultTarget, defaultWorldTarget, projection]);
  const initialTarget = useMemo(() => getGlobeCenter(projection), [projection]);
  const initialPosition = useMemo(() => {
    return getGlobeCameraPosition(initialGlobeSurfacePoint, projection, activeRadius * 2.85);
  }, [activeRadius, initialGlobeSurfacePoint, projection]);
  const selectedPin = useMemo(() => pins.find((pin) => pin.id === selectedPinId), [pins, selectedPinId]);
  const isUserControlling = useRef(false);
  const isProgrammaticFlight = useRef(false);
  const lastControlAt = useRef(0);
  const lastWheelAt = useRef(0);
  const lastSettledDistance = useRef(0);
  const activeFlight = useRef<CameraFlight | null>(null);
  const initializedView = useRef(false);
  const lastAppliedViewVersion = useRef(viewVersion);

  const enqueueWheelZoom = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const currentControls = controls.current;
    if (!currentControls) {
      return false;
    }

    const currentTarget = currentControls.getTarget(wheelTargetScratch.current);
    const currentPosition = currentControls.getPosition(wheelPositionScratch.current);
    const currentDistance = currentPosition.distanceTo(currentTarget);
    const currentMorph = getProjectionMorph(currentDistance, bounds, lod);
    const rect = gl.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return false;
    }

    activeFlight.current = null;
    isProgrammaticFlight.current = false;
    wheelEvents.current += 1;
    lastWheelAt.current = performance.now();

    wheelPointerScratch.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    wheelAnchorNdc.current.copy(wheelPointerScratch.current);
    wheelRaycaster.current.setFromCamera(wheelPointerScratch.current, camera);

    const intersections = wheelRaycaster.current.intersectObjects(scene.children, true)
      .map((intersection) => {
        const surface = findMapSurface(intersection.object);
        if (!surface) {
          return null;
        }
        return {
          intersection,
          facing: getFacingAmount(intersection.object, intersection.face?.normal, intersection.point, camera.position),
          priority: surface.userData.mapSurfacePriority ?? 0,
          surface
        } satisfies MapSurfaceHit;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter(({ facing }) => facing > 0.02)
      .filter(({ intersection }) => getObjectOpacity(intersection.object) > 0.012)
      .sort((a, b) => {
        return a.intersection.distance - b.intersection.distance || b.facing - a.facing || b.priority - a.priority;
      });

    const [bestHit] = intersections;
    if (bestHit) {
      const surfaceMorph = typeof bestHit.surface.userData.surfaceMorph === "number"
        ? bestHit.surface.userData.surfaceMorph
        : currentMorph;
      const anchorWorld = surfaceToMapWorld(
        bestHit.intersection.point,
        bounds,
        projection,
        surfaceMorph,
        OVERVIEW_PLANE_Y
      );
      wheelHits.current += 1;
      lastWheelAnchorWorld.current = anchorWorld;
      mapWorldToSurface(
        anchorWorld.x,
        anchorWorld.y,
        bounds,
        projection,
        currentMorph,
        OVERVIEW_PLANE_Y,
        wheelAnchor.current
      );
    } else {
      wheelFallbacks.current += 1;
      return false;
    }

    wheelZoomDelta.current = MathUtils.clamp(
      wheelZoomDelta.current + deltaY * WHEEL_ZOOM_SENSITIVITY,
      -0.58,
      0.58
    );
    lastControlAt.current = performance.now();
    return true;
  }, [bounds, camera, gl.domElement, lod, projection, scene]);

  const flyTo = useCallback((position: Vector3, target: Vector3, transition: boolean) => {
    if (!transition) {
      camera.position.copy(position);
      camera.lookAt(target);
      activeFlight.current = null;
    }

    const currentControls = controls.current;
    if (!currentControls) {
      return;
    }

    if (!transition) {
      void currentControls.setLookAt(
        position.x,
        position.y,
        position.z,
        target.x,
        target.y,
        target.z,
        false
      );
      return;
    }

    const fromPosition = currentControls.getPosition(new Vector3());
    const fromTarget = currentControls.getTarget(new Vector3());
    if (fromPosition.distanceTo(position) < 0.5 && fromTarget.distanceTo(target) < 0.5) {
      void currentControls.setLookAt(
        position.x,
        position.y,
        position.z,
        target.x,
        target.y,
        target.z,
        false
      );
      activeFlight.current = null;
      isProgrammaticFlight.current = false;
      return;
    }

    const horizontalDistance = Math.hypot(target.x - fromTarget.x, target.z - fromTarget.z);
    const fromDistance = fromPosition.distanceTo(fromTarget);
    const toDistance = position.distanceTo(target);
    const duration = MathUtils.clamp(
      980 + Math.sqrt(horizontalDistance + Math.abs(fromDistance - toDistance)) * 72,
      MIN_FLIGHT_MS,
      MAX_FLIGHT_MS
    );
    const travelDirection = new Vector3(target.x - fromTarget.x, 0, target.z - fromTarget.z);
    const hasTravelDirection = travelDirection.lengthSq() > 0.001;

    if (hasTravelDirection) {
      travelDirection.normalize();
    } else {
      travelDirection.set(1, 0, 0);
    }

    const side = new Vector3(-travelDirection.z, 0, travelDirection.x);
    const sideSign = fromPosition.clone().sub(fromTarget).dot(side) >= 0 ? 1 : -1;
    const lift = MathUtils.clamp(Math.max(fromDistance, toDistance) * 0.42, activeRadius * 0.48, activeRadius * 1.36);
    const lateralSweep = MathUtils.clamp(horizontalDistance * 0.28, activeRadius * 0.12, activeRadius * 0.58);
    const apexTarget = fromTarget.clone().lerp(target, 0.52).addScaledVector(side, sideSign * lateralSweep * 0.12);
    const apexPosition = fromPosition
      .clone()
      .lerp(position, 0.5)
      .add(new Vector3(0, lift, 0))
      .addScaledVector(side, sideSign * lateralSweep);

    isProgrammaticFlight.current = true;
    activeFlight.current = {
      startedAt: performance.now(),
      duration,
      fromPosition,
      fromTarget,
      apexPosition,
      apexTarget,
      toPosition: position.clone(),
      toTarget: target.clone()
    };
  }, [activeRadius, camera]);

  useEffect(() => {
    cameraTargetWorld.current = defaultWorldTarget ?? {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    };
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, defaultWorldTarget]);

  useEffect(() => {
    const focusTarget = focusRequest ?? selectedPin;

    if (!focusTarget) {
      return;
    }

    const target = mapWorldToSurface(focusTarget.x, focusTarget.y, bounds, projection, 1).setY(1.4);
    const position = target.clone().add(new Vector3(0, 242, 164));
    cameraTargetWorld.current = { x: focusTarget.x, y: focusTarget.y };
    flyTo(position, target, true);
  }, [bounds, flyTo, focusRequest, projection, selectedPin]);

  useEffect(() => {
    if (!rotationRequest || Math.abs(rotationRequest.deltaRadians) < 0.0001) {
      return;
    }

    const currentControls = controls.current;
    if (!currentControls) {
      return;
    }

    activeFlight.current = null;
    isProgrammaticFlight.current = false;
    lastControlAt.current = performance.now();
    void currentControls.rotate(rotationRequest.deltaRadians, 0, false);
  }, [rotationRequest]);

  useLayoutEffect(() => {
    if (focusRequest || selectedPin) {
      return;
    }

    const shouldResetView = !initializedView.current || lastAppliedViewVersion.current !== viewVersion;
    if (!shouldResetView) {
      return;
    }

    flyTo(initialPosition, initialTarget, false);
    isProgrammaticFlight.current = false;
    activeFlight.current = null;
    wheelZoomDelta.current = 0;
    initializedView.current = true;
    lastAppliedViewVersion.current = viewVersion;
  }, [flyTo, focusRequest, initialPosition, initialTarget, selectedPin, viewVersion]);

  useEffect(() => {
    const element = gl.domElement;
    const ownerDocument = element.ownerDocument;
    const ownerWindow = element.ownerDocument.defaultView ?? window;

    const handleWheel = (event: WheelEvent) => {
      if (isWheelFromUi(event)) {
        return;
      }

      if (enqueueWheelZoom(event.clientX, event.clientY, event.deltaY)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    ownerWindow.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    ownerDocument.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => {
      ownerWindow.removeEventListener("wheel", handleWheel, { capture: true });
      ownerDocument.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [enqueueWheelZoom, gl.domElement]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debugZoom") !== "1" || params.get("autoZoom") !== "1") {
      return;
    }

    let active = true;
    let count = 0;
    let timeoutId = 0;
    const maxSteps = Number(params.get("autoZoomSteps") ?? 72);
    const deltaY = Number(params.get("autoZoomDelta") ?? -1050);

    const step = () => {
      if (!active) {
        return;
      }

      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && enqueueWheelZoom(rect.left + rect.width * 0.46, rect.top + rect.height * 0.48, deltaY)) {
        count += 1;
      }

      if (count < maxSteps) {
        timeoutId = window.setTimeout(step, 140);
      }
    };

    timeoutId = window.setTimeout(step, 700);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [enqueueWheelZoom, gl.domElement]);

  useFrame((_, delta) => {
    const currentControls = controls.current;
    if (!currentControls) {
      return;
    }

    const flight = activeFlight.current;
    if (Math.abs(wheelZoomDelta.current) > 0.0001 && !isUserControlling.current) {
      const step = MathUtils.clamp(wheelZoomDelta.current, -MAX_WHEEL_ZOOM_STEP, MAX_WHEEL_ZOOM_STEP);
      const zoomScale = Math.exp(step);
      const anchor = wheelAnchor.current;
      const currentPosition = currentControls.getPosition(wheelPositionScratch.current);
      const currentTarget = currentControls.getTarget(wheelTargetScratch.current);
      const currentDistance = currentPosition.distanceTo(currentTarget);
      const currentMorph = getProjectionMorph(currentDistance, bounds, lod);
      const currentDirection = currentPosition.clone().sub(currentTarget).normalize();
      const anchorWorld = lastWheelAnchorWorld.current ?? surfaceToMapWorld(anchor, bounds, projection, currentMorph, OVERVIEW_PLANE_Y);
      mapWorldToSurface(
        anchorWorld.x,
        anchorWorld.y,
        bounds,
        projection,
        currentMorph,
        OVERVIEW_PLANE_Y,
        anchor
      );
      const nextPosition = anchor.clone().add(currentPosition.clone().sub(anchor).multiplyScalar(zoomScale));
      const nextTarget = anchor.clone().add(currentTarget.clone().sub(anchor).multiplyScalar(zoomScale));
      const nextDistance = MathUtils.clamp(nextPosition.distanceTo(nextTarget), 42, activeRadius * 4.2);
      const nextMorph = getProjectionMorph(nextDistance, bounds, lod);
      const nextAnchor = getSurfacePointFromUv(
        MathUtils.clamp((anchorWorld.x - bounds.minX) / bounds.width, 0, 1),
        MathUtils.clamp((bounds.maxY - anchorWorld.y) / bounds.depth, 0, 1),
        bounds,
        projection,
        nextMorph,
        OVERVIEW_PLANE_Y,
        wheelNextAnchorScratch.current
      );
      const anchorCorrection = nextAnchor.clone().sub(anchor);
      lastWheelAnchorWorld.current = anchorWorld;
      lastWheelAnchorCorrection.current.copy(anchorCorrection);
      nextPosition.add(anchorCorrection);
      nextTarget.add(anchorCorrection);

      const localSurfaceBlend = MathUtils.smoothstep(nextMorph, 0.82, 1);
      if (localSurfaceBlend > 0) {
        const targetSurfaceDelta = MathUtils.lerp(0, OVERVIEW_PLANE_Y - nextTarget.y, localSurfaceBlend);
        nextTarget.y += targetSurfaceDelta;
        nextPosition.y += targetSurfaceDelta;
      }

      const globeBlend = getWheelGlobeBlend(nextDistance, activeRadius, nextMorph);
      const nextDirection = wheelDirectionScratch.current.copy(currentDirection);
      const consistentAngleBlend = getWheelMapAngleBlend(nextDistance, activeRadius, nextMorph) * (1 - globeBlend);
      if (consistentAngleBlend > 0) {
        const settledDirection = getDirectionWithVertical(
          nextDirection,
          LOCAL_MAP_DIRECTION_Y,
          wheelSettledDirectionScratch.current
        );
        nextDirection.lerp(settledDirection, consistentAngleBlend).normalize();
        nextPosition.copy(nextTarget).addScaledVector(nextDirection, nextDistance);
      }

      if (globeBlend > 0 && projection) {
        const globeCenter = getGlobeCenter(projection, wheelGlobeCenterScratch.current);
        const globeDirection = wheelGlobeDirectionScratch.current.subVectors(currentPosition, globeCenter);
        if (globeDirection.lengthSq() < 0.0001) {
          const globeAnchor = mapWorldToSurface(
            anchorWorld.x,
            anchorWorld.y,
            bounds,
            projection,
            0,
            OVERVIEW_PLANE_Y,
            wheelGlobeAnchorScratch.current
          );
          globeDirection.subVectors(globeAnchor, globeCenter);
        }
        globeDirection.normalize();
        const globePosition = wheelGlobePositionScratch.current.copy(globeCenter).addScaledVector(globeDirection, nextDistance);
        nextTarget.lerp(globeCenter, globeBlend);
        nextPosition.lerp(globePosition, globeBlend);
      }

      correctCameraForCursorAnchor(
        camera,
        nextPosition,
        nextTarget,
        nextAnchor,
        wheelAnchorNdc.current,
        wheelCameraScratch.current,
        wheelProjectedScratch.current,
        wheelDesiredScratch.current,
        1 - globeBlend
      );

      cameraTargetWorld.current = surfaceToMapWorld(nextTarget, bounds, projection, nextMorph, OVERVIEW_PLANE_Y);

      if (nextDistance >= 42 && nextDistance <= activeRadius * 4.2) {
        void currentControls.setLookAt(
          nextPosition.x,
          nextPosition.y,
          nextPosition.z,
          nextTarget.x,
          nextTarget.y,
          nextTarget.z,
          false
        );
      }

      wheelZoomDelta.current -= step;
      if (Math.abs(wheelZoomDelta.current) < 0.0001) {
        wheelZoomDelta.current = 0;
      }
    } else if (flight && !isUserControlling.current) {
      const rawProgress = MathUtils.clamp((performance.now() - flight.startedAt) / flight.duration, 0, 1);
      const positionProgress = easeInOutQuint(rawProgress);
      const targetProgress = easeOutQuart(rawProgress);
      const position = bezierPoint(
        flight.fromPosition,
        flight.apexPosition,
        flight.toPosition,
        positionProgress,
        flightPositionScratch.current
      );
      const target = bezierPoint(
        flight.fromTarget,
        flight.apexTarget,
        flight.toTarget,
        targetProgress,
        flightTargetScratch.current
      );

      void currentControls.setLookAt(
        position.x,
        position.y,
        position.z,
        target.x,
        target.y,
        target.z,
        false
      );

      if (rawProgress >= 1) {
        activeFlight.current = null;
        isProgrammaticFlight.current = false;
      }
    }

    const debugTarget = currentControls.getTarget(targetScratch.current);
    const debugPosition = currentControls.getPosition(positionScratch.current);
    const distance = debugPosition.distanceTo(debugTarget);
    const phase = getCameraPhase(distance, activeRadius);
    const projectionMorph = getProjectionMorph(distance, bounds, lod);
    const compassWorldTarget = surfaceToMapWorld(debugTarget, bounds, projection, projectionMorph, OVERVIEW_PLANE_Y);
    const compassStep = Math.max(bounds.depth * 0.025, 24);
    const northWorldY = MathUtils.clamp(compassWorldTarget.y + compassStep, bounds.minY, bounds.maxY);
    const compassOrigin = mapWorldToSurface(
      compassWorldTarget.x,
      compassWorldTarget.y,
      bounds,
      projection,
      projectionMorph,
      OVERVIEW_PLANE_Y,
      compassOriginScratch.current
    );
    let compassNorth = compassNorthScratch.current;
    let invertCompassVector = false;

    if (northWorldY > compassWorldTarget.y + 0.001) {
      compassNorth = mapWorldToSurface(
        compassWorldTarget.x,
        northWorldY,
        bounds,
        projection,
        projectionMorph,
        OVERVIEW_PLANE_Y,
        compassNorthScratch.current
      );
    } else {
      const southWorldY = MathUtils.clamp(compassWorldTarget.y - compassStep, bounds.minY, bounds.maxY);
      compassNorth = mapWorldToSurface(
        compassWorldTarget.x,
        southWorldY,
        bounds,
        projection,
        projectionMorph,
        OVERVIEW_PLANE_Y,
        compassNorthScratch.current
      );
      invertCompassVector = true;
    }

    const compassOriginNdc = compassOriginNdcScratch.current.copy(compassOrigin).project(camera);
    const compassNorthNdc = compassNorthNdcScratch.current.copy(compassNorth).project(camera);
    const compassDx = invertCompassVector
      ? compassOriginNdc.x - compassNorthNdc.x
      : compassNorthNdc.x - compassOriginNdc.x;
    const compassDy = invertCompassVector
      ? compassOriginNdc.y - compassNorthNdc.y
      : compassNorthNdc.y - compassOriginNdc.y;
    if (
      Number.isFinite(compassDx) &&
      Number.isFinite(compassDy) &&
      Math.hypot(compassDx, compassDy) > 0.0001
    ) {
      const compassAngle = Math.atan2(compassDx, compassDy);
      if (Math.abs(getWrappedAngleDelta(compassAngle, lastCompassAngle.current)) > 0.006) {
        lastCompassAngle.current = compassAngle;
        useMapStore.getState().setCompassAngle(compassAngle);
      }
    }

    const mapViewBlend = getMapViewBlend(distance, activeRadius);
    const globeBlend = getWheelGlobeBlend(distance, activeRadius, projectionMorph);
    const isGlobeInteraction = globeBlend > 0.85 && projectionMorph < 0.12;
    const action = CameraControlsImpl.ACTION;

    if (mapViewBlend > 0.22 && Math.abs(wheelZoomDelta.current) < 0.0001) {
      cameraTargetWorld.current = surfaceToMapWorld(debugTarget, bounds, projection, projectionMorph, OVERVIEW_PLANE_Y);
    }

    currentControls.mouseButtons.left = isGlobeInteraction ? action.ROTATE : action.TRUCK;
    currentControls.mouseButtons.middle = action.DOLLY;
    currentControls.mouseButtons.right = action.TRUCK;
    currentControls.mouseButtons.wheel = action.NONE;
    currentControls.touches.one = isGlobeInteraction ? action.TOUCH_ROTATE : action.TOUCH_TRUCK;
    currentControls.touches.two = action.TOUCH_DOLLY_TRUCK;
    currentControls.minPolarAngle = MathUtils.degToRad(MathUtils.lerp(18, 0, mapViewBlend));
    currentControls.maxPolarAngle = MathUtils.degToRad(MathUtils.lerp(162, 74, mapViewBlend));
    currentControls.smoothTime = MathUtils.lerp(0.34, 0.2, mapViewBlend);
    currentControls.dollySpeed = MathUtils.lerp(
      0.34,
      0.92,
      MathUtils.smoothstep(distance, activeRadius * 0.42, activeRadius * 2.9)
    );

    const canIdleSpin =
      phase === "globe" &&
      !selectedPin &&
      !flight &&
      Math.abs(wheelZoomDelta.current) < 0.0001 &&
      !isUserControlling.current &&
      !isProgrammaticFlight.current &&
      performance.now() - lastControlAt.current > IDLE_SPIN_DELAY_MS;

    if (canIdleSpin) {
      void currentControls.rotate(IDLE_SPIN_SPEED * delta, 0, false);
    }

    if (phase === "globe" || isUserControlling.current || performance.now() - lastControlAt.current < SETTLE_DELAY_MS) {
      lastSettledDistance.current = distance;
    }

    if (window.location.search.includes("debugZoom=1")) {
      (window as ObservatoryDebugWindow).__OBSERVATORY_CAMERA__ = {
        directionY: debugPosition.clone().sub(debugTarget).normalize().y,
        distance,
        globeBlend,
        position: debugPosition.toArray() as [number, number, number],
        target: debugTarget.toArray() as [number, number, number],
        wheelEvents: wheelEvents.current,
        wheelHits: wheelHits.current,
        wheelFallbacks: wheelFallbacks.current,
        wheelDelta: wheelZoomDelta.current,
        projectionMorph,
        compassAngle: lastCompassAngle.current,
        phase,
        lastWheelAnchorWorld: lastWheelAnchorWorld.current
          ? [lastWheelAnchorWorld.current.x, lastWheelAnchorWorld.current.y]
          : undefined,
        lastWheelAnchorCorrection: lastWheelAnchorCorrection.current.toArray() as [number, number, number]
      };
      document.documentElement.dataset.observatoryCamera = JSON.stringify({
        directionY: debugPosition.clone().sub(debugTarget).normalize().y,
        distance,
        globeBlend,
        position: debugPosition.toArray(),
        target: debugTarget.toArray(),
        wheelEvents: wheelEvents.current,
        wheelHits: wheelHits.current,
        wheelFallbacks: wheelFallbacks.current,
        wheelDelta: wheelZoomDelta.current,
        projectionMorph,
        compassAngle: lastCompassAngle.current,
        phase,
        lastWheelAnchorWorld: lastWheelAnchorWorld.current
          ? [lastWheelAnchorWorld.current.x, lastWheelAnchorWorld.current.y]
          : undefined,
        lastWheelAnchorCorrection: lastWheelAnchorCorrection.current.toArray()
      });
    }
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      dollyToCursor={false}
      smoothTime={0.28}
      draggingSmoothTime={0.08}
      dollySpeed={0.58}
      truckSpeed={1.55}
      azimuthRotateSpeed={0.72}
      polarRotateSpeed={0.62}
      restThreshold={0.18}
      minDistance={42}
      maxDistance={activeRadius * 4.2}
      boundaryFriction={0.12}
      onControlStart={() => {
        activeFlight.current = null;
        isUserControlling.current = true;
        isProgrammaticFlight.current = false;
        lastControlAt.current = performance.now();
      }}
      onControl={() => {
        lastControlAt.current = performance.now();
      }}
      onControlEnd={() => {
        isUserControlling.current = false;
        lastControlAt.current = performance.now();
      }}
      onRest={() => {
        isUserControlling.current = false;
        const currentControls = controls.current;
        if (!currentControls) {
          return;
        }

        const target = currentControls.getTarget(targetScratch.current);
        const currentPosition = currentControls.getPosition(positionScratch.current);
        const distance = currentPosition.distanceTo(target);
        const projectionMorph = getProjectionMorph(distance, bounds, lod);
        cameraTargetWorld.current = surfaceToMapWorld(target, bounds, projection, projectionMorph, OVERVIEW_PLANE_Y);
        lastSettledDistance.current = distance;
      }}
    />
  );
}
