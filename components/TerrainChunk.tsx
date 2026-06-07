"use client";

import { useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import { buildTerrainMesh } from "@/lib/terrain/buildMesh";
import type { LoadedTerrainChunk } from "@/lib/terrain/loadTerrain";

type TerrainChunkProps = {
  terrain: LoadedTerrainChunk;
};

export function TerrainChunk({ terrain }: TerrainChunkProps) {
  const geometry = useMemo(() => {
    const mesh = buildTerrainMesh(terrain);
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    nextGeometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
    nextGeometry.setIndex(new BufferAttribute(mesh.indices, 1));
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [terrain]);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0.04} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#d8f1ea" wireframe transparent opacity={0.085} />
      </mesh>
    </group>
  );
}
