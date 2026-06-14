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
  type: "skill" | "quest" | "boss" | "transport";
  x: number;
  y: number;
  plane: number;
  description: string;
  wikiUrl?: string;
  questName?: string;
  coordinateSource?: {
    label: string;
    url?: string;
    confidence: "wiki" | "open-source" | "manual";
    note?: string;
  };
  requirements?: {
    skills?: Record<string, number>;
    quests?: string[];
  };
};
