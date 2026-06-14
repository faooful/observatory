import type { PlayerLookup } from "@/lib/osrs/player";

export type ActivityType = "quest" | "money" | "boss";
export type ActivityState = "ready" | "blocked" | "recommended" | "completed";

export type Requirement = {
  label: string;
  met: boolean;
  detail?: string;
};

export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  locationName: string;
  location: { x: number; y: number; z?: number };
  coordinates: { x: number; y: number; z?: number };
  state: ActivityState;
  status: "ready" | "blocked";
  description: string;
  summary: string;
  requirements?: Requirement[];
  rewards?: string[];
  metrics?: {
    gpPerHour?: number;
    xpPerHour?: number;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    estimatedMinutes?: number;
    popularity?: number;
  };
  route?: { steps: string[] };
  links?: { wiki?: string };
  recommendationReason?: string;
};

export type ActivitySeedRequirement = {
  label: string;
  skill?: string;
  level?: number;
  quest?: string;
};

export type ActivitySeed = Omit<Activity, "state" | "status" | "description" | "requirements"> & {
  baseState: ActivityState;
  questName?: string;
  requirements?: ActivitySeedRequirement[];
};

export type ActivityContext = {
  player: PlayerLookup | null;
};
