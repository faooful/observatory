"use client";

import { Html } from "@react-three/drei";
import { useMemo, useState } from "react";
import { Color } from "three";
import type { LoadedTerrainChunk } from "@/lib/terrain/loadTerrain";
import { useMapStore } from "@/lib/store/useMapStore";
import type { ActivityPin } from "@/lib/terrain/types";

const typeColors: Record<ActivityPin["type"], string> = {
  skill: "#63d7a6",
  quest: "#80a8ff",
  boss: "#f06b6b",
  transport: "#c28cff"
};

type MapPinProps = {
  pin: ActivityPin;
  terrain: LoadedTerrainChunk;
};

export function MapPin({ pin, terrain }: MapPinProps) {
  const [hovered, setHovered] = useState(false);
  const selectedPinId = useMapStore((state) => state.selectedPinId);
  const selectPin = useMapStore((state) => state.selectPin);
  const selected = selectedPinId === pin.id;
  const color = typeColors[pin.type];
  const emissive = useMemo(() => new Color(color), [color]);
  const position = terrain.worldToScene(pin.x, pin.y, terrain.sampleHeight(pin.x, pin.y) + 28);

  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        selectPin(pin.id);
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh position={[0, -12, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 24, 10]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.62} />
      </mesh>
      <mesh scale={selected || hovered ? 1.45 : 1}>
        <sphereGeometry args={[3.2, 24, 24]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={selected || hovered ? 2.4 : 1.1} />
      </mesh>
      <mesh scale={selected || hovered ? 1.85 : 1.35}>
        <sphereGeometry args={[3.5, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={selected || hovered ? 0.18 : 0.08} />
      </mesh>
      {(selected || hovered) && (
        <Html position={[0, 8, 0]} center distanceFactor={18} style={{ pointerEvents: "none" }}>
          <div
            style={{
              border: "1px solid rgba(231,197,107,0.55)",
              borderRadius: 8,
              padding: "6px 9px",
              background: "rgba(8,12,16,0.86)",
              color: "#edf7f5",
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap"
            }}
          >
            {pin.label}
          </div>
        </Html>
      )}
    </group>
  );
}
