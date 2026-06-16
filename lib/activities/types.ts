import type { PlayerLookup } from "@/lib/osrs/player";

export type ActivityType = "quest" | "money" | "boss" | "skilling" | "diary" | "clue";
export type ActivityState = "ready" | "blocked" | "recommended" | "completed";
export type RecommendationTier = "readyNow" | "nearUnlock" | "longTerm";

export type Requirement = {
  label: string;
  met: boolean;
  skill?: string;
  level?: number;
  quest?: string;
  detail?: string;
  progress?: {
    current: number;
    target: number;
  };
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
  icon?: string;
  requirements?: Requirement[];
  rewards?: string[];
  metrics?: {
    gpPerHour?: number;
    xpPerHour?: number;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    estimatedMinutes?: number;
    popularity?: number;
  };
  moneyMaker?: {
    category: string;
    intensity: string;
  };
  boss?: {
    category: string;
    difficulty: string;
  };
  gearSetups?: Array<{
    tier: "Low" | "Med" | "High";
    style?: string;
    note: string;
    source?: string;
    items: Array<{
      slot: string;
      item: string;
      wikiTitle?: string;
      icon?: string;
    }>;
  }>;
  route?: { steps: string[] };
  links?: { wiki?: string };
  recommendationReason?: string;
  recommendationTier?: RecommendationTier;
  whyNow?: string;
  accountSignals?: string[];
  missingRequirements?: Requirement[];
  unlockProgress?: number;
  nextStep?: string;
  collectionLogPage?: {
    source: string;
    obtained: number;
    total?: number;
    accountObtained: number;
    accountTotal: number;
    loggedItems: Array<{
      id: number;
      count: number;
      date?: string;
      name?: string;
    }>;
    missingItems?: Array<{
      id: number;
      name?: string;
    }>;
  };
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

export type AccountUnderstanding = {
  label: string;
  summary: string;
  signals: string[];
};

export type RecommendationGroup = {
  tier: RecommendationTier;
  label: string;
  description: string;
  activities: Activity[];
};
