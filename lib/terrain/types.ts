export type TerrainChunk = {
  id: string;
  baseX: number;
  baseY: number;
  size: number;
  tileSize: number;
  heights: number[][];
  materials?: number[][];
};

export type ActivityPin = {
  id: string;
  label: string;
  type: "city" | "skill" | "quest" | "boss" | "transport";
  x: number;
  y: number;
  plane: number;
  description: string;
  requirements?: {
    skills?: Record<string, number>;
    quests?: string[];
  };
};
