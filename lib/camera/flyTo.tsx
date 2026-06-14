"use client";

import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
const WHEEL_ANCHOR_LOCK_MS = 15000;
const WHEEL_ANCHOR_POINTER_PX = 96;
const MIN_FLIGHT_MS = 1250;
const MAX_FLIGHT_MS = 2600;
const WHEEL_ZOOM_SENSITIVITY = 0.00078;
const MAX_WHEEL_ZOOM_STEP = 0.07;
const IDLE_SPIN_DELAY_MS = 1100;
const IDLE_SPIN_SPEED = 0.035;

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

type ObservatoryDebugWindow = Window & {
  __OBSERVATORY_CAMERA__?: {
    distance: number;
    position: [number, number, number];
    target: [number, number, number];
    wheelEvents: number;
    wheelHits: number;
    wheelFallbacks: number;
    wheelDelta: number;
    projectionMorph: number;
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

function getSettledPosition(target: Vector3, distance: number, localBlend: number) {
  const offset = new Vector3(
    0,
    MathUtils.lerp(0.72, 0.96, localBlend),
    MathUtils.lerp(0.56, 0.24, localBlend)
  ).setLength(distance);

  return target.clone().add(offset);
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
  const lastWheelClient = useRef(new Vector2(Number.NaN, Number.NaN));
  const wheelPositionScratch = useRef(new Vector3());
  const wheelTargetScratch = useRef(new Vector3());
  const wheelAnchor = useRef(new Vector3());
  const lastWheelAnchorWorld = useRef<OsrsWorldPoint | null>(null);
  const lastWheelAnchorCorrection = useRef(new Vector3());
  const wheelZoomDelta = useRef(0);
  const wheelEvents = useRef(0);
  const wheelHits = useRef(0);
  const wheelFallbacks = useRef(0);
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const viewVersion = useMapStore((state) => state.viewVersion);
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

    const now = performance.now();
    const isContinuousWheel =
      now - lastWheelAt.current < WHEEL_ANCHOR_LOCK_MS &&
      Number.isFinite(lastWheelClient.current.x) &&
      lastWheelClient.current.distanceTo(wheelPointerScratch.current.set(clientX, clientY)) < WHEEL_ANCHOR_POINTER_PX &&
      lastWheelAnchorWorld.current !== null;

    activeFlight.current = null;
    isProgrammaticFlight.current = false;
    wheelEvents.current += 1;
    lastWheelAt.current = now;
    lastWheelClient.current.set(clientX, clientY);

    wheelPointerScratch.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    wheelRaycaster.current.setFromCamera(wheelPointerScratch.current, camera);

    const intersections = wheelRaycaster.current.intersectObjects(scene.children, true)
      .map((intersection) => {
        const surface = findMapSurface(intersection.object);
        return surface ? { intersection, surface } : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter(({ intersection }) => getObjectOpacity(intersection.object) > 0.012)
      .sort((a, b) => {
        const priorityA = a.surface.userData.mapSurfacePriority ?? 0;
        const priorityB = b.surface.userData.mapSurfacePriority ?? 0;
        return priorityB - priorityA || a.intersection.distance - b.intersection.distance;
      });

    const [bestHit] = intersections;
    if (isContinuousWheel && lastWheelAnchorWorld.current) {
      const anchorWorld = lastWheelAnchorWorld.current;
      mapWorldToSurface(
        anchorWorld.x,
        anchorWorld.y,
        bounds,
        projection,
        currentMorph,
        OVERVIEW_PLANE_Y,
        wheelAnchor.current
      );
    } else if (bestHit) {
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
      const fallbackWorld =
        lastWheelAnchorWorld.current ??
        surfaceToMapWorld(currentTarget, bounds, projection, currentMorph, OVERVIEW_PLANE_Y);
      wheelFallbacks.current += 1;
      lastWheelAnchorWorld.current = fallbackWorld;
      mapWorldToSurface(
        fallbackWorld.x,
        fallbackWorld.y,
        bounds,
        projection,
        currentMorph,
        OVERVIEW_PLANE_Y,
        wheelAnchor.current
      );
    }

    wheelZoomDelta.current = MathUtils.clamp(
      wheelZoomDelta.current + deltaY * WHEEL_ZOOM_SENSITIVITY,
      -0.72,
      0.72
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
    if (!selectedPin) {
      flyTo(initialPosition, initialTarget, true);
      return;
    }

    const target = mapWorldToSurface(selectedPin.x, selectedPin.y, bounds, projection, 1).setY(1.4);
    const position = target.clone().add(new Vector3(0, 242, 164));
    flyTo(position, target, true);
  }, [bounds, flyTo, initialPosition, initialTarget, projection, selectedPin, viewVersion]);

  useLayoutEffect(() => {
    flyTo(initialPosition, initialTarget, false);
    isProgrammaticFlight.current = false;
  }, [flyTo, initialPosition, initialTarget, viewVersion]);

  useEffect(() => {
    const element = gl.domElement;
    const ownerDocument = element.ownerDocument;
    const ownerWindow = element.ownerDocument.defaultView ?? window;

    const handleWheel = (event: WheelEvent) => {
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
      const nextPosition = anchor.clone().add(currentPosition.sub(anchor).multiplyScalar(zoomScale));
      const nextTarget = anchor.clone().add(currentTarget.sub(anchor).multiplyScalar(zoomScale));
      const nextDistance = nextPosition.distanceTo(nextTarget);
      const nextMorph = getProjectionMorph(nextDistance, bounds, lod);
      const nextAnchor = getSurfacePointFromUv(
        MathUtils.clamp((anchorWorld.x - bounds.minX) / bounds.width, 0, 1),
        MathUtils.clamp((bounds.maxY - anchorWorld.y) / bounds.depth, 0, 1),
        bounds,
        projection,
        nextMorph,
        OVERVIEW_PLANE_Y
      );
      const anchorCorrection = nextAnchor.sub(anchor);
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

      const globeSurfaceBlend = 1 - MathUtils.smoothstep(nextMorph, 0.04, 0.28);
      if (globeSurfaceBlend > 0) {
        const targetShift = getGlobeCenter(projection).sub(nextTarget).multiplyScalar(globeSurfaceBlend);
        nextTarget.add(targetShift);
        nextPosition.add(targetShift);
      }

      nextPosition.copy(nextTarget).addScaledVector(currentDirection, nextDistance);

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
    const mapViewBlend = 1 - MathUtils.smoothstep(distance, activeRadius * 0.44, activeRadius * 2.35);
    const isGlobe = phase === "globe";
    const action = CameraControlsImpl.ACTION;

    currentControls.mouseButtons.left = isGlobe ? action.ROTATE : action.TRUCK;
    currentControls.mouseButtons.middle = action.DOLLY;
    currentControls.mouseButtons.right = action.TRUCK;
    currentControls.mouseButtons.wheel = action.NONE;
    currentControls.touches.one = isGlobe ? action.TOUCH_ROTATE : action.TOUCH_TRUCK;
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

    if (isGlobe || isUserControlling.current || performance.now() - lastControlAt.current < SETTLE_DELAY_MS) {
      lastSettledDistance.current = distance;
    }

    if (window.location.search.includes("debugZoom=1")) {
      (window as ObservatoryDebugWindow).__OBSERVATORY_CAMERA__ = {
        distance,
        position: debugPosition.toArray() as [number, number, number],
        target: debugTarget.toArray() as [number, number, number],
        wheelEvents: wheelEvents.current,
        wheelHits: wheelHits.current,
        wheelFallbacks: wheelFallbacks.current,
        wheelDelta: wheelZoomDelta.current,
        projectionMorph,
        phase,
        lastWheelAnchorWorld: lastWheelAnchorWorld.current
          ? [lastWheelAnchorWorld.current.x, lastWheelAnchorWorld.current.y]
          : undefined,
        lastWheelAnchorCorrection: lastWheelAnchorCorrection.current.toArray() as [number, number, number]
      };
      document.documentElement.dataset.observatoryCamera = JSON.stringify({
        distance,
        position: debugPosition.toArray(),
        target: debugTarget.toArray(),
        wheelEvents: wheelEvents.current,
        wheelHits: wheelHits.current,
        wheelFallbacks: wheelFallbacks.current,
        wheelDelta: wheelZoomDelta.current,
        projectionMorph,
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
        const phase = getCameraPhase(distance, activeRadius);
        const mapViewBlend = 1 - MathUtils.smoothstep(distance, activeRadius * 0.44, activeRadius * 2.35);
        const localBlend = 1 - MathUtils.smoothstep(distance, activeRadius * 0.28, activeRadius * 0.82);
        if (isProgrammaticFlight.current || activeFlight.current) {
          return;
        }

        isProgrammaticFlight.current = false;
        lastSettledDistance.current = distance;

        if (
          phase === "globe" ||
          mapViewBlend <= 0.08 ||
          performance.now() - lastControlAt.current < SETTLE_DELAY_MS ||
          performance.now() - lastWheelAt.current < WHEEL_SETTLE_DELAY_MS
        ) {
          return;
        }

        const position = getSettledPosition(target, distance, localBlend);
        if (currentPosition.distanceTo(position) < 0.35) {
          return;
        }

        void currentControls.setLookAt(
          position.x,
          position.y,
          position.z,
          target.x,
          target.y,
          target.z,
          true
        );
      }}
    />
  );
}
