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
  | "Construction";

export type SkillSnapshot = {
  rank: number;
  level: number;
  experience: number;
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
  quests: Record<string, number>;
  questTitles: Record<string, string>;
  questMarkers: QuestMarker[];
  unmappedIncompleteQuests: string[];
  questSource: "wikisync" | "unavailable";
  questMessage?: string;
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
  "Construction"
];

export function normalizeQuestName(name: string) {
  return name.trim().toLowerCase();
}

export function isQuestComplete(quests: Record<string, number>, questName: string) {
  return quests[normalizeQuestName(questName)] === 2;
}

export function getSkillLevel(skills: PlayerLookup["skills"], skillName: string) {
  return skills[skillName as SkillName]?.level ?? 1;
}
