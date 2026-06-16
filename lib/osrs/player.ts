import type { OsrsSourceId, OsrsSourceLink } from "./sources";
import type { WikiQuestDetails } from "./wikiQuestDetails";

export type SkillName =
  | "Overall"
  | "Attack"
  | "Defence"
  | "Strength"
  | "Hitpoints"
  | "Ranged"
  | "Prayer"
  | "Magic"
  | "Cooking"
  | "Woodcutting"
  | "Fletching"
  | "Fishing"
  | "Firemaking"
  | "Crafting"
  | "Smithing"
  | "Mining"
  | "Herblore"
  | "Agility"
  | "Thieving"
  | "Slayer"
  | "Farming"
  | "Runecraft"
  | "Hunter"
  | "Construction"
  | "Sailing";

export type SkillSnapshot = {
  rank: number;
  level: number;
  experience: number;
};

export type BossSnapshot = {
  rank: number;
  kills: number;
};

export type ActivitySnapshot = {
  rank: number;
  score: number;
};

export type EfficiencySnapshot = {
  ehp?: number;
  ehb?: number;
  ttm?: number;
};

export type CollectionLogSnapshot = {
  source: "temple-osrs" | "collectionlog-net";
  uniqueObtained: number;
  uniqueItems: number;
  lastSynced?: string;
  categoriesFinished?: number;
  categoriesAvailable?: number;
  ehc?: number;
  categoryCounts?: Record<string, number>;
  categoryTotals?: Record<string, number>;
  categoryItems?: Record<string, Array<{
    id: number;
    count: number;
    date?: string;
    name?: string;
    obtained?: boolean;
  }>>;
  categoryMissingItems?: Record<string, Array<{
    id: number;
    name?: string;
  }>>;
  topCategories?: Array<{
    id: string;
    obtained: number;
    total?: number;
  }>;
  recentItems?: Array<{
    category: string;
    id: number;
    count: number;
    date?: string;
    name?: string;
    obtained?: boolean;
  }>;
};

export type AchievementProgressSnapshot = {
  name: string;
  metric: string;
  measure: string;
  threshold: number;
  currentValue: number;
  progress: number;
};

export type AchievementSnapshot = {
  completedCount: number;
  near: AchievementProgressSnapshot[];
};

export type AccountSourceStatus = {
  sourceId: OsrsSourceId;
  status: "available" | "unavailable";
  message?: string;
};

export type QuestMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
  plane: number;
  description: string;
  wikiUrl?: string;
  mapUrl?: string;
  questName: string;
  questState: QuestStateValue;
  source: "osrs-wiki+wikisync";
  sourceIds: OsrsSourceId[];
  sourceLinks: OsrsSourceLink[];
  wikiDetails?: WikiQuestDetails;
  coordinateSource?: {
    label: string;
    url?: string;
    confidence: "wiki" | "open-source" | "manual";
    note?: string;
  };
};

export type PlayerLookup = {
  username: string;
  fetchedAt: string;
  skills: Partial<Record<SkillName, SkillSnapshot>>;
  combatLevel?: number;
  accountType?: string;
  bosses?: Record<string, BossSnapshot>;
  activities?: Record<string, ActivitySnapshot>;
  efficiency?: EfficiencySnapshot;
  achievements?: AchievementSnapshot;
  collectionLog?: CollectionLogSnapshot;
  quests: Record<string, number>;
  questTitles: Record<string, string>;
  questMarkers: QuestMarker[];
  unmappedIncompleteQuests: string[];
  questSource: "wikisync" | "unavailable";
  questSyncedAt?: string;
  questMessage?: string;
  sourceStatuses?: AccountSourceStatus[];
  sourceLinks: OsrsSourceLink[];
};

export const SKILL_ORDER: SkillName[] = [
  "Overall",
  "Attack",
  "Defence",
  "Strength",
  "Hitpoints",
  "Ranged",
  "Prayer",
  "Magic",
  "Cooking",
  "Woodcutting",
  "Fletching",
  "Fishing",
  "Firemaking",
  "Crafting",
  "Smithing",
  "Mining",
  "Herblore",
  "Agility",
  "Thieving",
  "Slayer",
  "Farming",
  "Runecraft",
  "Hunter",
  "Construction",
  "Sailing"
];

export function normalizeQuestName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

export type QuestStateValue = 0 | 1 | 2;

export function normalizeQuestState(state: unknown): QuestStateValue {
  if (state === true || state === "complete" || state === "completed" || state === "finished") {
    return 2;
  }

  const numericState = Number(state);
  if (numericState === 2) {
    return 2;
  }
  if (numericState === 1) {
    return 1;
  }

  return 0;
}

export function getQuestState(quests: Record<string, number>, questName: string): QuestStateValue {
  return normalizeQuestState(quests[normalizeQuestName(questName)]);
}

export function isQuestComplete(quests: Record<string, number>, questName: string) {
  return getQuestState(quests, questName) === 2;
}

export function getSkillLevel(skills: PlayerLookup["skills"], skillName: string) {
  return skills[skillName as SkillName]?.level ?? 1;
}
