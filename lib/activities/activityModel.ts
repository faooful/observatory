import seeds from "@/data/activities/osrs-activities.json";
import bossStrategyGearData from "@/data/activities/osrs-boss-strategy-gear.json";
import wikiBossData from "@/data/activities/osrs-bosses.json";
import wikiMoneyMakerData from "@/data/activities/osrs-money-makers.json";
import { getSkillLevel, isQuestComplete, SKILL_ORDER, type PlayerLookup, type QuestMarker } from "@/lib/osrs/player";
import type {
  AccountUnderstanding,
  Activity,
  ActivityContext,
  ActivitySeed,
  ActivityState,
  ActivityType,
  RecommendationGroup,
  RecommendationTier,
  Requirement
} from "./types";

export const activitySeeds = seeds as ActivitySeed[];

type WikiMoneyMaker = {
  id: string;
  title: string;
  wiki: string;
  category: string;
  intensity: string;
  members: boolean;
  gpPerHour: number;
  requirements: Array<{
    label: string;
    skill: string;
    level: number;
  }>;
};

const wikiMoneyMakers = (wikiMoneyMakerData as { moneyMakers: WikiMoneyMaker[] }).moneyMakers;

type WikiBoss = {
  id: string;
  title: string;
  wiki: string;
  summary: string;
  category: string;
  difficulty: string;
  combatLevel?: number;
  quest?: string;
  locationName: string;
  coordinates?: { x: number; y: number };
};

const wikiBosses = (wikiBossData as { bosses: WikiBoss[] }).bosses;

type BossStrategyGear = {
  id: string;
  title: string;
  source: string;
  preferredStyle?: string;
  setups: NonNullable<Activity["gearSetups"]>;
};

const bossStrategyGear = (bossStrategyGearData as { bosses: BossStrategyGear[] }).bosses;
const bossStrategyGearByKey = new Map(
  bossStrategyGear.flatMap((entry) => [
    [entry.id, entry],
    [entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), entry]
  ])
);

export const ACTIVITY_LAYERS: Array<{ type: ActivityType; label: string }> = [
  { type: "quest", label: "Quests" },
  { type: "money", label: "Money" },
  { type: "boss", label: "Bosses" },
  { type: "skilling", label: "Skilling" },
  { type: "diary", label: "Diaries" }
];

const RECOMMENDATION_GROUPS: Array<Omit<RecommendationGroup, "activities">> = [
  {
    tier: "readyNow",
    label: "Available Now",
    description: "Activities this account meets the visible requirements for."
  },
  {
    tier: "nearUnlock",
    label: "Needs A Check",
    description: "Activities with requirements that are not fully confirmed."
  },
  {
    tier: "longTerm",
    label: "Not Available",
    description: "Activities with visible unmet requirements."
  }
];

const RECOMMENDATION_LIMIT = 5;

const SKILLS_BY_LOWERCASE = new Map(SKILL_ORDER.map((skill) => [skill.toLowerCase(), skill]));

const COLLECTION_LOG_LOCATIONS: Record<string, { locationName: string; coordinates: Activity["coordinates"]; wiki?: string; route?: string[] }> = {
  abyssal_sire: {
    locationName: "Abyssal Nexus",
    coordinates: { x: 3038, y: 4772 },
    wiki: "https://oldschool.runescape.wiki/w/Abyssal_Sire",
    route: ["Review the Abyssal Sire log page", "Send focused Sire trips for missing uniques"]
  },
  araxxor: {
    locationName: "Morytania Spider Cave",
    coordinates: { x: 3650, y: 9815 },
    wiki: "https://oldschool.runescape.wiki/w/Araxxor",
    route: ["Review the Araxxor log page", "Run focused Araxxor kills for missing drops"]
  },
  barrows_chests: {
    locationName: "Morytania Barrows",
    coordinates: { x: 3565, y: 3289 },
    wiki: "https://oldschool.runescape.wiki/w/Barrows",
    route: ["Gear for Barrows", "Run chest rotations", "Track missing Barrows equipment"]
  },
  brimhaven_agility_arena: {
    locationName: "Brimhaven Agility Arena",
    coordinates: { x: 2809, y: 3192 },
    wiki: "https://oldschool.runescape.wiki/w/Brimhaven_Agility_Arena",
    route: ["Travel to Brimhaven", "Earn tickets", "Buy missing arena rewards"]
  },
  chompy_bird_hunting: {
    locationName: "Feldip Hills",
    coordinates: { x: 2596, y: 2968 },
    wiki: "https://oldschool.runescape.wiki/w/Chompy_bird_hunting",
    route: ["Travel to Feldip Hills", "Hunt chompies", "Work toward missing hats"]
  },
  forestry: {
    locationName: "Forestry hotspots",
    coordinates: { x: 2725, y: 3485 },
    wiki: "https://oldschool.runescape.wiki/w/Forestry",
    route: ["Join active Forestry worlds", "Complete events", "Buy missing Forestry rewards"]
  },
  guardians_of_the_rift: {
    locationName: "Temple of the Eye",
    coordinates: { x: 3615, y: 9489 },
    wiki: "https://oldschool.runescape.wiki/w/Guardians_of_the_Rift",
    route: ["Enter the Temple of the Eye", "Play Guardians of the Rift", "Spend pearls on missing rewards"]
  },
  hard_treasure_trails: {
    locationName: "Hard clue sources",
    coordinates: { x: 2860, y: 9845 },
    wiki: "https://oldschool.runescape.wiki/w/Treasure_Trails/Guide/Hard",
    route: ["Farm hard clue sources", "Complete each clue chain", "Track missing hard clue uniques"]
  },
  miscellaneous: {
    locationName: "Varrock Museum",
    coordinates: { x: 3260, y: 3446 },
    wiki: "https://oldschool.runescape.wiki/w/Collection_log",
    route: ["Review the Miscellaneous log page", "Pick a missing page item", "Work through the fastest remaining unlock"]
  },
  random_events: {
    locationName: "Random events",
    coordinates: { x: 3222, y: 3218 },
    wiki: "https://oldschool.runescape.wiki/w/Random_events",
    route: ["Keep random events enabled", "Complete events when they appear", "Track missing outfit pieces"]
  },
  shades_of_mortton: {
    locationName: "Mort'ton",
    coordinates: { x: 3500, y: 3290 },
    wiki: "https://oldschool.runescape.wiki/w/Shades_of_Mort%27ton_(minigame)",
    route: ["Travel to Mort'ton", "Burn shade remains", "Open chests for missing rewards"]
  },
  shared_treasure_trail_rewards: {
    locationName: "Treasure Trails",
    coordinates: { x: 3166, y: 9628 },
    wiki: "https://oldschool.runescape.wiki/w/Treasure_Trails",
    route: ["Pick a clue tier", "Farm clue scrolls", "Track shared clue reward slots"]
  },
  slayer: {
    locationName: "Slayer Tower",
    coordinates: { x: 3428, y: 3538 },
    wiki: "https://oldschool.runescape.wiki/w/Slayer_collection_log",
    route: ["Review missing Slayer log slots", "Choose a matching Slayer task or boss", "Camp the missing drop source"]
  },
  wintertodt: {
    locationName: "Wintertodt Camp",
    coordinates: { x: 1630, y: 3944 },
    wiki: "https://oldschool.runescape.wiki/w/Wintertodt",
    route: ["Travel to Wintertodt Camp", "Open supply crates", "Track missing Wintertodt uniques"]
  }
};

const WIKI_MONEY_MAKER_LOCATION = {
  locationName: "Money making guide",
  coordinates: { x: 3164, y: 3485 }
} satisfies { locationName: string; coordinates: Activity["coordinates"] };

const WIKI_BOSS_LOCATION = {
  locationName: "Bosses",
  coordinates: { x: 3087, y: 3493 }
} satisfies { locationName: string; coordinates: Activity["coordinates"] };

const WIKI_BOSS_ENTRANCES: Record<string, { locationName: string; coordinates: Activity["coordinates"] }> = {
  barrows: { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "barrows-brothers": { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "dharok-the-wretched": { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "guthan-the-infested": { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "torag-the-corrupted": { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "verac-the-defiled": { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "ahrim-the-blighted": { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "karil-the-tainted": { locationName: "Morytania Barrows", coordinates: { x: 3565, y: 3289 } },
  "zulrah": { locationName: "Zul-Andra", coordinates: { x: 2200, y: 3056 } },
  "sol-heredit": { locationName: "Fortis Colosseum", coordinates: { x: 1824, y: 3107 } },
  "the-gauntlet": { locationName: "Prifddinas access", coordinates: { x: 2244, y: 3182 } },
  "corrupted-hunllef": { locationName: "Prifddinas access", coordinates: { x: 2244, y: 3182 } },
  "crystalline-hunllef": { locationName: "Prifddinas access", coordinates: { x: 2244, y: 3182 } },
  "nex": { locationName: "God Wars Dungeon entrance", coordinates: { x: 2918, y: 3745 } },
  "general-graardor": { locationName: "God Wars Dungeon entrance", coordinates: { x: 2918, y: 3745 } },
  "commander-zilyana": { locationName: "God Wars Dungeon entrance", coordinates: { x: 2918, y: 3745 } },
  "kree-arra": { locationName: "God Wars Dungeon entrance", coordinates: { x: 2918, y: 3745 } },
  "k-ril-tsutsaroth": { locationName: "God Wars Dungeon entrance", coordinates: { x: 2918, y: 3745 } },
  "the-nightmare": { locationName: "Slepe", coordinates: { x: 3724, y: 3335 } },
  "phosani-s-nightmare": { locationName: "Slepe", coordinates: { x: 3724, y: 3335 } },
  "zalcano": { locationName: "Prifddinas access", coordinates: { x: 2244, y: 3182 } },
  "hespori": { locationName: "Farming Guild", coordinates: { x: 1240, y: 3752 } },
  "tempoross": { locationName: "Tempoross Cove", coordinates: { x: 3135, y: 2840 } },
  "branda-the-fire-queen": { locationName: "Asgarnian Ice Dungeon", coordinates: { x: 3008, y: 3150 } },
  "eldric-the-ice-king": { locationName: "Asgarnian Ice Dungeon", coordinates: { x: 3008, y: 3150 } },
  "royal-titans": { locationName: "Asgarnian Ice Dungeon", coordinates: { x: 3008, y: 3150 } },
  "revenant-maledictus": { locationName: "Revenant Caves", coordinates: { x: 3071, y: 3652 } },
  "penance-queen": { locationName: "Barbarian Assault", coordinates: { x: 2533, y: 3571 } },
  "the-mimic": { locationName: "Watson's House", coordinates: { x: 1643, y: 3578 } },
  "phantom-muspah": { locationName: "Weiss salt mine", coordinates: { x: 2867, y: 3941 } },
  "araxxor": { locationName: "Morytania Spider Cave entrance", coordinates: { x: 3657, y: 3407 } },
  "alchemical-hydra": { locationName: "Mount Karuulm", coordinates: { x: 1311, y: 3807 } },
  "abyssal-sire": { locationName: "Mage of Zamorak", coordinates: { x: 3104, y: 3560 } },
  "cerberus": { locationName: "Taverley Dungeon entrance", coordinates: { x: 2884, y: 3395 } },
  "kalphite-queen": { locationName: "Kalphite Lair entrance", coordinates: { x: 3226, y: 3108 } },
  "blood-moon": { locationName: "Cam Torum access", coordinates: { x: 1453, y: 3165 } },
  "blue-moon": { locationName: "Cam Torum access", coordinates: { x: 1453, y: 3165 } },
  "eclipse-moon": { locationName: "Cam Torum access", coordinates: { x: 1453, y: 3165 } },
  "skotizo": { locationName: "Catacombs of Kourend entrance", coordinates: { x: 1696, y: 3865 } },
  "sarachnis": { locationName: "Forthos Dungeon entrance", coordinates: { x: 1690, y: 3570 } },
  "dagannoth-prime": { locationName: "Waterbirth Island", coordinates: { x: 2525, y: 3743 } },
  "dagannoth-rex": { locationName: "Waterbirth Island", coordinates: { x: 2525, y: 3743 } },
  "dagannoth-supreme": { locationName: "Waterbirth Island", coordinates: { x: 2525, y: 3743 } },
  "thermonuclear-smoke-devil": { locationName: "Smoke Devil Dungeon entrance", coordinates: { x: 2412, y: 3061 } },
  "kraken": { locationName: "Kraken Cove entrance", coordinates: { x: 2278, y: 3611 } },
  "king-black-dragon": { locationName: "Lava Maze Dungeon entrance", coordinates: { x: 3019, y: 3849 } },
  "giant-mole": { locationName: "Falador Park", coordinates: { x: 2996, y: 3375 } },
  "scorpia": { locationName: "Scorpion Pit", coordinates: { x: 3240, y: 3944 } },
  "bryophyta": { locationName: "Varrock Sewers entrance", coordinates: { x: 3237, y: 3458 } },
  "obor": { locationName: "Edgeville Dungeon entrance", coordinates: { x: 3097, y: 3469 } },
  "salarin-the-twisted": { locationName: "Yanille Agility Dungeon entrance", coordinates: { x: 2570, y: 3123 } },
  "grotesque-guardians": { locationName: "Slayer Tower roof", coordinates: { x: 3428, y: 3538 } },
  "dusk": { locationName: "Slayer Tower roof", coordinates: { x: 3428, y: 3538 } },
  "dawn": { locationName: "Slayer Tower roof", coordinates: { x: 3428, y: 3538 } },
  "spindel": { locationName: "Web Chasm entrance", coordinates: { x: 3179, y: 3741 } },
  "calvar-ion": { locationName: "Skeletal Tomb entrance", coordinates: { x: 3176, y: 3695 } }
};

function formatGpPerHour(gpPerHour: number) {
  if (gpPerHour >= 1000000) {
    return `${Math.round(gpPerHour / 100000) / 10}M GP/hr`;
  }

  return `${Math.round(gpPerHour / 1000).toLocaleString()}k GP/hr`;
}

function getWikiFileIcon(fileName: string) {
  return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

function normalizeIconSubject(value: string) {
  return value
    .replace(/\s*\(.+?\)\s*/g, " ")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getMoneyMakerIconSubject(title: string, category: string) {
  const normalizedTitle = title.trim();
  const specificMatches: Array<[RegExp, string]> = [
    [/mole parts/i, "Mole claw"],
    [/crystal keys/i, "Crystal key"],
    [/eternal glories/i, "Amulet of eternal glory"],
    [/larran's big chests/i, "Larran's big chest"],
    [/raw yellowfin/i, "Raw yellowfin"],
    [/raw marlin/i, "Raw marlin"],
    [/raw wild pies/i, "Raw wild pie"],
    [/toy cats/i, "Toy cat"],
    [/sanfew serum/i, "Sanfew serum(4)"],
    [/herb boxes/i, "Herb box"],
    [/dynamite/i, "Dynamite"],
    [/bird house/i, "Bird house"],
    [/battlestaves/i, "Battlestaff"],
    [/oathplate/i, "Oathplate body"],
    [/incendiary cannonballs/i, "Rune incendiary cannonball"],
    [/aether runes/i, "Aether rune"],
    [/sunfire runes/i, "Sunfire rune"],
    [/blood runes/i, "Blood rune"],
    [/wrath runes/i, "Wrath rune"],
    [/nature runes/i, "Nature rune"],
    [/runite bars/i, "Runite bar"],
    [/adamantite bars/i, "Adamantite bar"],
    [/tan leather/i, "Tan leather"],
    [/magic saplings/i, "Magic sapling"],
    [/celastrus sapling/i, "Celastrus sapling"],
    [/poisoning ammunition/i, "Weapon poison(++)"]
  ];
  const specificMatch = specificMatches.find(([pattern]) => pattern.test(normalizedTitle));
  if (specificMatch) {
    return specificMatch[1];
  }

  const activityMatch = normalizedTitle.match(/^(?:Killing|Completing|Looting|Pickpocketing|Opening|Crafting|Smithing|Smelting|Casting|Creating|Making|Cutting|Growing|Planting)\s+(.+?)(?:\s+\(.+?\))?$/i);
  if (activityMatch?.[1]) {
    return normalizeIconSubject(activityMatch[1]);
  }

  if (/combat/i.test(category)) {
    return normalizeIconSubject(normalizedTitle);
  }

  return "";
}

function getMoneyMakerIcon(title: string, category: string) {
  const subject = getMoneyMakerIconSubject(title, category);
  return subject ? getWikiFileIcon(`${subject}.png`) : "/osrs-icons/coins-10000.png";
}

function getBossIcon(title: string) {
  return getWikiFileIcon(`${normalizeIconSubject(title)}.png`);
}

function getWikiMoneyMakerDifficulty(moneyMaker: WikiMoneyMaker): NonNullable<Activity["metrics"]>["difficulty"] {
  if (/high/i.test(moneyMaker.intensity) || /combat\/high/i.test(moneyMaker.category)) {
    return 4;
  }

  if (/moderate/i.test(moneyMaker.intensity)) {
    return 2;
  }

  if (/low/i.test(moneyMaker.intensity)) {
    return 1;
  }

  return 3;
}

function getMoneyMakerCategory(category: string) {
  const normalized = category.trim();
  const baseCategory = normalized.split("/")[0].replace(/\s*\(.+?\)\s*/g, "").trim();

  if (/^combat$/i.test(baseCategory)) {
    return "Combat";
  }
  if (/^farming$/i.test(baseCategory)) {
    return "Farming";
  }
  if (/^processing$/i.test(baseCategory)) {
    return "Processing";
  }
  if (/^skilling$/i.test(baseCategory)) {
    return "Skilling";
  }
  if (/^cooking$/i.test(baseCategory)) {
    return "Cooking";
  }

  return baseCategory || "Other";
}

function getIntensityFromDifficulty(difficulty?: number) {
  if ((difficulty ?? 0) >= 4) {
    return "High";
  }

  if ((difficulty ?? 0) >= 2) {
    return "Moderate";
  }

  return "Low";
}

function getSeedMoneyMakerProfile(seed: ActivitySeed): Activity["moneyMaker"] {
  if (seed.type !== "money") {
    return undefined;
  }

  const title = seed.title.toLowerCase();
  const category =
    title.includes("herb") || title.includes("sepulchre") || title.includes("gauntlet")
      ? "Skilling"
      : title.includes("barrows") || title.includes("dragon") || title.includes("vorkath") || title.includes("zulrah") || title.includes("revenant")
        ? "Combat"
        : "Money making";

  return {
    category,
    intensity: getIntensityFromDifficulty(seed.metrics?.difficulty)
  };
}

function getBossEntrance(id: string, title: string) {
  const idKey = id.replace(/^wiki-boss-/, "").replace(/-(boss|money)$/, "");
  const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return WIKI_BOSS_ENTRANCES[idKey] ?? WIKI_BOSS_ENTRANCES[titleKey];
}

function getBossStrategyGear(id: string, title: string) {
  const idKey = id.replace(/^wiki-boss-/, "").replace(/-(boss|money)$/, "");
  const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return bossStrategyGearByKey.get(idKey)?.setups ?? bossStrategyGearByKey.get(titleKey)?.setups;
}

function getBossCombatRequirement(boss: WikiBoss) {
  if (boss.difficulty === "Raid" || boss.difficulty === "Very high") {
    return 100;
  }
  if (boss.difficulty === "High") {
    return 85;
  }
  if (boss.difficulty === "Mid") {
    return 60;
  }
  if (boss.difficulty === "Low") {
    return 30;
  }

  return 0;
}

function getBossDifficultyScore(difficulty: string): NonNullable<Activity["metrics"]>["difficulty"] {
  if (difficulty === "Raid" || difficulty === "Very high") {
    return 5;
  }
  if (difficulty === "High") {
    return 4;
  }
  if (difficulty === "Mid") {
    return 3;
  }
  if (difficulty === "Low") {
    return 2;
  }

  return 3;
}

function getSeedBossProfile(seed: ActivitySeed): Activity["boss"] {
  if (seed.type !== "boss") {
    return undefined;
  }

  const title = seed.title.toLowerCase();
  const category = title.includes("tombs") ? "Raid" : title.includes("gauntlet") ? "Boss" : title.includes("graardor") ? "God Wars" : "Boss";

  return {
    category,
    difficulty: getIntensityFromDifficulty(seed.metrics?.difficulty)
  };
}

function evaluateWikiBossRequirements(boss: WikiBoss, player: PlayerLookup | null): Requirement[] {
  const requirements: Requirement[] = [];
  const combatRequirement = getBossCombatRequirement(boss);

  if (combatRequirement > 0) {
    const combatLevel = player?.combatLevel ?? (player ? getCombatAverage(player) : combatRequirement);
    requirements.push({
      label: `Combat level ${combatRequirement}`,
      met: combatLevel >= combatRequirement,
      skill: "Combat",
      level: combatRequirement,
      detail: `${combatLevel}/${combatRequirement}`,
      progress: {
        current: combatLevel,
        target: combatRequirement
      }
    });
  }

  if (boss.quest) {
    const met = player?.questSource === "wikisync" ? isQuestComplete(player.quests, boss.quest) : true;
    requirements.push({
      label: boss.quest,
      met,
      quest: boss.quest,
      detail: met ? "Complete" : "Incomplete"
    });
  }

  return requirements;
}

function evaluateWikiMoneyMakerRequirements(moneyMaker: WikiMoneyMaker, player: PlayerLookup | null): Requirement[] {
  return moneyMaker.requirements.map((requirement) => {
    if (!player) {
      return {
        label: requirement.label,
        met: true,
        skill: requirement.skill,
        level: requirement.level,
        detail: "Wiki guide requirement"
      };
    }

    const actualLevel = getSkillLevel(player.skills, requirement.skill);
    return {
      label: requirement.label,
      met: actualLevel >= requirement.level,
      skill: requirement.skill,
      level: requirement.level,
      detail: `${actualLevel}/${requirement.level}`,
      progress: {
        current: actualLevel,
        target: requirement.level
      }
    };
  });
}

function evaluateRequirements(seed: ActivitySeed, context: ActivityContext): Requirement[] {
  return (seed.requirements ?? []).map((requirement) => {
    if (!context.player) {
      return {
        label: requirement.label,
        met: seed.baseState !== "blocked",
        detail: seed.baseState === "blocked" ? "Account check needed" : "Source requirement"
      };
    }

    if (requirement.skill && requirement.level) {
      const actualLevel = getSkillLevel(context.player.skills, requirement.skill);
      return {
        label: requirement.label,
        met: actualLevel >= requirement.level,
        skill: requirement.skill,
        level: requirement.level,
        detail: `${actualLevel}/${requirement.level}`,
        progress: {
          current: actualLevel,
          target: requirement.level
        }
      };
    }

    if (requirement.quest) {
      return {
        label: requirement.label,
        met: isQuestComplete(context.player.quests, requirement.quest),
        quest: requirement.quest,
        detail: isQuestComplete(context.player.quests, requirement.quest) ? "Complete" : "Incomplete"
      };
    }

    return { label: requirement.label, met: true };
  });
}

function getSkillRequirement(requirement: string) {
  const normalizedRequirement = requirement.toLowerCase();
  for (const [lowercaseSkill, skill] of SKILLS_BY_LOWERCASE) {
    if (!normalizedRequirement.includes(lowercaseSkill)) {
      continue;
    }

    const levelMatch = normalizedRequirement.match(new RegExp(`(\\d{1,3})\\s+${lowercaseSkill.replace(/\s+/g, "\\s+")}`));
    if (levelMatch) {
      return {
        skill,
        level: Number(levelMatch[1])
      };
    }
  }

  return null;
}

function getQuestRequirement(requirement: string) {
  const completionMatch = requirement.match(/^Completion of\s+(.+?)(?:\s+no)?$/i);
  if (!completionMatch) {
    return null;
  }

  return completionMatch[1].replace(/^the following quests:\s*/i, "").trim();
}

function evaluateWikiQuestRequirements(marker: QuestMarker, player: PlayerLookup): Requirement[] {
  return (marker.wikiDetails?.requirements ?? []).slice(0, 10).map((requirement) => {
    const skillRequirement = getSkillRequirement(requirement);
    if (skillRequirement) {
      const actualLevel = getSkillLevel(player.skills, skillRequirement.skill);
      return {
        label: requirement,
        met: actualLevel >= skillRequirement.level,
        skill: skillRequirement.skill,
        level: skillRequirement.level,
        detail: `${actualLevel}/${skillRequirement.level}`,
        progress: {
          current: actualLevel,
          target: skillRequirement.level
        }
      };
    }

    const questRequirement = getQuestRequirement(requirement);
    if (questRequirement) {
      const met = isQuestComplete(player.quests, questRequirement);
      return {
        label: requirement,
        met,
        quest: questRequirement,
        detail: met ? "Complete" : "Incomplete"
      };
    }

    return {
      label: requirement,
      met: true,
      detail: "OSRS Wiki"
    };
  });
}

function getQuestStateLabel(state: QuestMarker["questState"]) {
  return state === 1 ? "In progress" : "Not started";
}

function evaluateState(seed: ActivitySeed, requirements: Requirement[], context: ActivityContext): ActivityState {
  if (context.player && seed.questName && isQuestComplete(context.player.quests, seed.questName)) {
    return "completed";
  }

  if (requirements.some((requirement) => !requirement.met && requirement.detail !== "Account check needed")) {
    return "blocked";
  }

  if (seed.baseState === "recommended") {
    return "recommended";
  }

  if (seed.baseState === "completed") {
    return context.player ? "completed" : "ready";
  }

  if (seed.baseState === "blocked" && !context.player) {
    return "blocked";
  }

  return "ready";
}

function getDynamicQuestActivities(player: PlayerLookup): Activity[] {
  return player.questMarkers.map((marker) => {
    const requirements = evaluateWikiQuestRequirements(marker, player);
    const blocked = requirements.some((requirement) => !requirement.met);
    const questStateLabel = getQuestStateLabel(marker.questState);
    const summary = `${marker.description} WikiSync says: ${questStateLabel}.`;
    const routeSteps = [
      marker.wikiDetails?.start,
      marker.mapUrl ? "Use the map link to inspect the exact start area." : undefined,
      marker.wikiUrl ? "Open the OSRS Wiki guide for the full walkthrough." : undefined
    ].filter((step): step is string => Boolean(step));

    return {
      id: `quest-${marker.id}`,
      type: "quest",
      title: marker.questName,
      locationName: marker.wikiDetails?.start ?? marker.label,
      location: { x: marker.x, y: marker.y, z: marker.plane },
      coordinates: { x: marker.x, y: marker.y, z: marker.plane },
      state: blocked ? "blocked" : "ready",
      status: blocked ? "blocked" : "ready",
      description: summary,
      summary,
      requirements,
      rewards: marker.wikiDetails?.rewards,
      route: routeSteps.length ? { steps: routeSteps } : undefined,
      links: marker.wikiUrl ? { wiki: marker.wikiUrl } : undefined,
      recommendationReason: `WikiSync currently reports ${marker.questName} as ${questStateLabel.toLowerCase()}.`
    } satisfies Activity;
  });
}

function titleizeCollectionLogPage(id: string) {
  return id
    .split(":")
    .pop()
    ?.replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || "Collection Log";
}

function normalizeCollectionLogPageId(id: string) {
  return normalizeMetricName(id.split(":").pop() ?? id);
}

function getCollectionLogLocation(id: string) {
  const normalized = normalizeCollectionLogPageId(id);
  return (
    COLLECTION_LOG_LOCATIONS[normalized] ?? {
      locationName: titleizeCollectionLogPage(id),
      coordinates: { x: 3260, y: 3446 },
      wiki: "https://oldschool.runescape.wiki/w/Collection_log",
      route: ["Open the synced collection log page", "Choose the fastest missing slot", "Track progress toward green logging"]
    }
  );
}

function getDynamicCollectionLogActivities(player: PlayerLookup): Activity[] {
  const collectionLog = player.collectionLog;
  if (!collectionLog?.categoryCounts) {
    return [];
  }

  const entries = Object.entries(collectionLog.categoryCounts)
    .map(([id, obtained]) => ({
      id,
      obtained,
      total: collectionLog.categoryTotals?.[id]
    }))
    .filter((entry) => entry.obtained > 0)
    .sort((left, right) => {
      const leftMissing = typeof left.total === "number" ? left.total - left.obtained : Number.POSITIVE_INFINITY;
      const rightMissing = typeof right.total === "number" ? right.total - right.obtained : Number.POSITIVE_INFINITY;
      return leftMissing - rightMissing || right.obtained - left.obtained;
    })
    .slice(0, 8);

  return entries.map((entry) => {
    const location = getCollectionLogLocation(entry.id);
    const title = titleizeCollectionLogPage(entry.id);
    const hasTotal = typeof entry.total === "number" && entry.total > 0;
    const total = hasTotal ? entry.total as number : undefined;
    const remaining = total ? Math.max(0, total - entry.obtained) : undefined;
    const progress = total ? Math.min(1, entry.obtained / Math.max(1, total)) : undefined;
    const loggedItems = collectionLog.categoryItems?.[entry.id] ?? [];
    const missingItems = collectionLog.categoryMissingItems?.[entry.id];
    const summary = hasTotal
      ? `${entry.obtained}/${total} slots logged. ${remaining === 0 ? "This page is green logged." : `${remaining} slots remain before green logging.`}`
      : `${entry.obtained} synced slots on this log page. TempleOSRS does not expose the page total, so this is ranked by tracked progress.`;

    return {
      id: `collection-log-${normalizeCollectionLogPageId(entry.id)}`,
      type: "clue",
      title,
      locationName: location.locationName,
      location: location.coordinates,
      coordinates: location.coordinates,
      state: "ready",
      status: "ready",
      description: summary,
      summary,
      requirements: [{ label: "Synced collection log data", met: true, detail: collectionLog.source }],
      rewards: ["Collection log slots", "Green log progress"],
      metrics: {
        difficulty: remaining === 0 ? 1 : remaining && remaining <= 3 ? 2 : 3,
        popularity: hasTotal ? Math.round((progress ?? 0) * 100) : Math.min(95, 55 + entry.obtained),
        estimatedMinutes: remaining && remaining <= 3 ? 20 : 45
      },
      route: { steps: location.route ?? ["Open the collection log page", "Target the nearest missing slots"] },
      links: location.wiki ? { wiki: location.wiki } : undefined,
      recommendationReason: hasTotal
        ? remaining === 0
          ? `${title} is already green logged.`
          : `${title} is close to green logging with ${remaining} slots left.`
        : `${title} has ${entry.obtained} synced slots, making it one of this account's most progressed log pages.`,
      recommendationTier: remaining === 0 ? "readyNow" : remaining && remaining <= 5 ? "nearUnlock" : "longTerm",
      whyNow: hasTotal
        ? remaining === 0
          ? "This page is already complete, so it is useful context for collection-log routing."
          : `${remaining} slots remain before this page is green logged.`
        : "This is one of the account's most progressed synced log pages.",
      accountSignals: [
        total ? `${entry.obtained}/${total} slots logged` : `${entry.obtained} slots logged`,
        `${collectionLog.uniqueObtained}/${collectionLog.uniqueItems} total log slots`,
        `Source: ${collectionLog.source}`
      ],
      missingRequirements: [],
      unlockProgress: progress,
      nextStep: location.route?.[0] ?? `Review the ${title} collection log page.`,
      collectionLogPage: {
        source: collectionLog.source,
        obtained: entry.obtained,
        total,
        accountObtained: collectionLog.uniqueObtained,
        accountTotal: collectionLog.uniqueItems,
        loggedItems,
        missingItems
      }
    } satisfies Activity;
  });
}

function getWikiMoneyMakerActivities(player: PlayerLookup | null): Activity[] {
  return wikiMoneyMakers.map((moneyMaker) => {
    const requirements = evaluateWikiMoneyMakerRequirements(moneyMaker, player);
    const blocked = requirements.some((requirement) => !requirement.met);
    const gpPerHourLabel = formatGpPerHour(moneyMaker.gpPerHour);
    const category = getMoneyMakerCategory(moneyMaker.category);
    const summary = `${gpPerHourLabel} from the OSRS Wiki money making guide. Category: ${category}.`;

    return {
      id: moneyMaker.id,
      type: "money",
      title: moneyMaker.title,
      locationName: WIKI_MONEY_MAKER_LOCATION.locationName,
      location: WIKI_MONEY_MAKER_LOCATION.coordinates,
      coordinates: WIKI_MONEY_MAKER_LOCATION.coordinates,
      state: blocked ? "blocked" : "ready",
      status: blocked ? "blocked" : "ready",
      description: summary,
      summary,
      icon: getMoneyMakerIcon(moneyMaker.title, category),
      requirements,
      rewards: [gpPerHourLabel, category, `${moneyMaker.intensity} intensity`],
      metrics: {
        gpPerHour: moneyMaker.gpPerHour,
        difficulty: getWikiMoneyMakerDifficulty(moneyMaker),
        popularity: moneyMaker.members ? 70 : 55
      },
      moneyMaker: {
        category,
        intensity: moneyMaker.intensity
      },
      route: {
        steps: [
          `Use the map marker at ${WIKI_MONEY_MAKER_LOCATION.locationName} as the guide hub.`,
          "Open the OSRS Wiki guide for the exact method location and setup.",
          "Check current Grand Exchange prices before buying supplies."
        ]
      },
      links: { wiki: moneyMaker.wiki },
      recommendationReason: `${moneyMaker.title} is listed at ${gpPerHourLabel} on the OSRS Wiki money making guide.`
    } satisfies Activity;
  });
}

function getWikiBossActivities(player: PlayerLookup | null): Activity[] {
  return wikiBosses.map((boss) => {
    const requirements = evaluateWikiBossRequirements(boss, player);
    const blocked = requirements.some((requirement) => !requirement.met);
    const entrance = getBossEntrance(boss.id, boss.title);
    const coordinates = entrance?.coordinates ?? boss.coordinates ?? WIKI_BOSS_LOCATION.coordinates;
    const locationName = entrance?.locationName ?? (boss.locationName === "Bosses" ? WIKI_BOSS_LOCATION.locationName : boss.locationName);
    const combatLabel = boss.combatLevel ? `Combat level ${boss.combatLevel}` : boss.difficulty;
    const summary = `${boss.summary} ${combatLabel ? `(${combatLabel})` : ""}`.trim();

    return {
      id: boss.id,
      type: "boss",
      title: boss.title,
      locationName,
      location: coordinates,
      coordinates,
      state: blocked ? "blocked" : "ready",
      status: blocked ? "blocked" : "ready",
      description: summary,
      summary,
      icon: getBossIcon(boss.title),
      requirements,
      rewards: [boss.category, boss.difficulty, boss.combatLevel ? `Level ${boss.combatLevel}` : undefined].filter((reward): reward is string => Boolean(reward)),
      metrics: {
        difficulty: getBossDifficultyScore(boss.difficulty),
        popularity: boss.combatLevel ? Math.min(100, Math.max(35, Math.round(boss.combatLevel / 12))) : 45
      },
      boss: {
        category: boss.category,
        difficulty: boss.difficulty
      },
      gearSetups: getBossStrategyGear(boss.id, boss.title),
      route: {
        steps: [
          entrance || boss.coordinates ? `Use the map marker at ${locationName}.` : `Use the ${WIKI_BOSS_LOCATION.locationName} marker as a boss guide hub.`,
          "Open the OSRS Wiki guide for mechanics, access, and setup."
        ]
      },
      links: { wiki: boss.wiki },
      recommendationReason: `This account meets the visible checks for ${boss.title} from the OSRS Wiki boss data.`
    } satisfies Activity;
  });
}

export function getActivities(context: ActivityContext): Activity[] {
  const hasDynamicQuestData = Boolean(context.player?.questMarkers.length);
  const hasCollectionLogData = Boolean(context.player?.collectionLog?.categoryCounts);
  const seedActivities: Activity[] = activitySeeds.filter((seed) => {
    if (context.player && seed.type === "diary") {
      return false;
    }

    if (hasDynamicQuestData && seed.type === "quest") {
      return false;
    }

    if (hasCollectionLogData && seed.type === "clue") {
      return false;
    }

    return true;
  }).map((seed) => {
    const requirements = evaluateRequirements(seed, context);
    const state = evaluateState(seed, requirements, context);
    const status: Activity["status"] = state === "blocked" ? "blocked" : "ready";
    const bossEntrance = seed.type === "boss" ? getBossEntrance(seed.id, seed.title) : undefined;
    const coordinates = bossEntrance?.coordinates ?? seed.coordinates;

    return {
      id: seed.id,
      type: seed.type,
      title: seed.title,
      locationName: bossEntrance?.locationName ?? seed.locationName,
      location: coordinates,
      coordinates,
      state,
      status,
      description: seed.summary,
      summary: seed.summary,
      icon: seed.icon ?? (seed.type === "boss" ? getBossIcon(seed.title) : seed.type === "money" ? getMoneyMakerIcon(seed.title, seed.moneyMaker?.category ?? getSeedMoneyMakerProfile(seed)?.category ?? "") : undefined),
      requirements,
      rewards: seed.rewards,
      metrics: seed.metrics,
      moneyMaker: seed.moneyMaker ?? getSeedMoneyMakerProfile(seed),
      boss: seed.boss ?? getSeedBossProfile(seed),
      gearSetups: seed.type === "boss" ? getBossStrategyGear(seed.id, seed.title) : undefined,
      route: seed.route,
      links: seed.links,
      recommendationReason: seed.recommendationReason
    } satisfies Activity;
  });

  const moneyMakerActivities = getWikiMoneyMakerActivities(context.player);
  const bossActivities = getWikiBossActivities(context.player);

  if (context.player) {
    return [
      ...getDynamicQuestActivities(context.player),
      ...getDynamicCollectionLogActivities(context.player),
      ...seedActivities,
      ...moneyMakerActivities,
      ...bossActivities
    ];
  }

  return [...seedActivities, ...moneyMakerActivities, ...bossActivities];
}

export function getVisibleActivities(activities: Activity[], type: ActivityType) {
  return activities.filter((activity) => activity.type === type && activity.state !== "completed");
}

export function getAccountVisibleActivities(activities: Activity[], type: ActivityType, context: ActivityContext) {
  return getVisibleActivities(activities, type);
}

export function sortRecommendations(activities: Activity[]) {
  const ranked = [...activities]
    .filter((activity) => activity.state !== "completed")
    .sort((a, b) => {
      const stateScore = (activity: Activity) =>
        activity.status === "ready" ? 4 : activity.status === "blocked" ? 1 : 0;
      const valueScore = (activity: Activity) =>
        (activity.metrics?.gpPerHour ?? 0) / 1000000 +
        (activity.metrics?.xpPerHour ?? 0) / 100000 +
        (activity.metrics?.popularity ?? 0) / 40 -
        (activity.metrics?.estimatedMinutes ?? 20) / 120;

      return stateScore(b) - stateScore(a) || valueScore(b) - valueScore(a);
    });

  const seenTitles = new Set<string>();
  return ranked.filter((activity) => {
    const key = activity.title.toLowerCase();
    if (seenTitles.has(key)) {
      return false;
    }
    seenTitles.add(key);
    return true;
  });
}

function getCompletedQuestCount(player: PlayerLookup | null) {
  return Object.values(player?.quests ?? {}).filter((state) => state === 2).length;
}

function getCombatAverage(player: PlayerLookup | null) {
  if (!player) {
    return 1;
  }

  const combatSkills = ["Attack", "Strength", "Defence", "Hitpoints", "Ranged", "Magic", "Prayer"];
  return Math.round(combatSkills.reduce((sum, skill) => sum + getSkillLevel(player.skills, skill), 0) / combatSkills.length);
}

function normalizeMetricName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function getAccountUnderstanding(player: PlayerLookup | null): AccountUnderstanding {
  if (!player) {
    return {
      label: "Account lookup needed",
      summary: "Enter an RSN to show activities this account can do now.",
      signals: ["Hiscores and WikiSync power the account checks."]
    };
  }

  const totalLevel = player.skills.Overall?.level ?? 0;
  const completedQuests = getCompletedQuestCount(player);
  const combatAverage = getCombatAverage(player);
  const combatLabel = player.combatLevel ? `Combat level ${player.combatLevel}` : `Combat core around ${combatAverage}`;
  const signals = [
    `Total level ${totalLevel || "unknown"}`,
    combatLabel,
    player.questSource === "wikisync" ? `${completedQuests} quests complete` : "Quest sync unavailable",
    player.collectionLog ? `${player.collectionLog.uniqueObtained}/${player.collectionLog.uniqueItems} collection log slots` : undefined,
    player.collectionLog?.categoriesFinished && player.collectionLog.categoriesAvailable
      ? `${player.collectionLog.categoriesFinished}/${player.collectionLog.categoriesAvailable} log categories`
      : undefined,
    player.achievements ? `${player.achievements.completedCount} WOM achievements` : undefined,
    player.efficiency?.ehb ? `${Math.round(player.efficiency.ehb)} EHB tracked` : undefined
  ].filter((signal): signal is string => Boolean(signal));

  if (totalLevel >= 1900 || combatAverage >= 88 || (player.combatLevel ?? 0) >= 120) {
    return {
      label: "End-game account",
      summary: "This account meets checks for a wide range of bosses, raids, and money makers.",
      signals
    };
  }

  if (combatAverage >= 75) {
    return {
      label: "Bossing-ready account",
      summary: "Combat stats meet checks for many profitable PvM activities.",
      signals
    };
  }

  if (completedQuests >= 120) {
    return {
      label: "Quest-focused account",
      summary: "Quest completions open a broad set of map activities.",
      signals
    };
  }

  if (totalLevel >= 1000 || combatAverage >= 55) {
    return {
      label: "Mid-game account",
      summary: "The account meets checks for several quests, money makers, and bosses.",
      signals
    };
  }

  return {
    label: "Early account",
    summary: "The account can start with low-requirement activities shown on the map.",
    signals
  };
}

function getActivityTypeLabel(type: ActivityType) {
  return ACTIVITY_LAYERS.find((layer) => layer.type === type)?.label ?? type;
}

function getValueScore(activity: Activity) {
  return (
    (activity.metrics?.gpPerHour ?? 0) / 1000000 +
    (activity.metrics?.xpPerHour ?? 0) / 100000 +
    (activity.metrics?.popularity ?? 0) / 38 -
    (activity.metrics?.estimatedMinutes ?? 18) / 150 +
    (activity.recommendationReason ? 0.35 : 0)
  );
}

function getMissingRequirements(activity: Activity) {
  return (activity.requirements ?? []).filter((requirement) => !requirement.met);
}

function getRequirementGap(requirement: Requirement) {
  if (!requirement.progress) {
    return 1;
  }

  return Math.max(0, requirement.progress.target - requirement.progress.current);
}

function getUnlockProgress(activity: Activity) {
  const requirements = activity.requirements ?? [];
  if (requirements.length === 0) {
    return activity.status === "ready" ? 1 : 0;
  }

  const progress = requirements.reduce((sum, requirement) => {
    if (requirement.met) {
      return sum + 1;
    }

    if (requirement.progress) {
      return sum + Math.min(0.95, requirement.progress.current / Math.max(1, requirement.progress.target));
    }

    return sum;
  }, 0);

  return progress / requirements.length;
}

function getRecommendationTier(activity: Activity): RecommendationTier {
  const missing = getMissingRequirements(activity);

  if (activity.status === "ready") {
    return "readyNow";
  }

  const skillGap = missing.reduce((gap, requirement) => gap + getRequirementGap(requirement), 0);
  const hasConcreteMissing = missing.some((requirement) => requirement.progress || /incomplete/i.test(requirement.detail ?? ""));
  if (missing.length <= 2 && hasConcreteMissing && skillGap <= 25) {
    return "nearUnlock";
  }

  return "longTerm";
}

function getAccountSignals(activity: Activity, player: PlayerLookup | null) {
  const signals = (activity.requirements ?? [])
    .filter((requirement) => requirement.met)
    .slice(0, 3)
    .map((requirement) => `${requirement.label}: ${requirement.detail ?? "met"}`);

  if (activity.metrics?.gpPerHour) {
    signals.push(`${Math.round(activity.metrics.gpPerHour / 100000) / 10}M GP/hr potential`);
  } else if (activity.metrics?.xpPerHour) {
    signals.push(`${Math.round(activity.metrics.xpPerHour / 1000)}k XP/hr potential`);
  }

  if (player?.questSource === "wikisync" && activity.type === "quest") {
    signals.push("Matched against WikiSync quest state");
  }

  const metricName = normalizeMetricName(activity.title);
  const bossSnapshot = player?.bosses?.[metricName];
  if (bossSnapshot?.kills) {
    signals.push(`${bossSnapshot.kills.toLocaleString()} KC tracked`);
  }

  const nearAchievement = player?.achievements?.near.find((achievement) => achievement.metric === metricName);
  if (nearAchievement) {
    signals.push(`${Math.round(nearAchievement.progress * 100)}% to ${nearAchievement.name}`);
  }

  const collectionCategory = player?.collectionLog?.categoryCounts?.[metricName];
  if (typeof collectionCategory === "number") {
    signals.push(`${collectionCategory} collection slots in this log page`);
  }

  if (activity.type === "clue") {
    const clueMetric = activity.title.includes("Easy")
      ? "clue_scrolls_easy"
      : activity.title.includes("Medium")
        ? "clue_scrolls_medium"
        : activity.title.includes("Hard")
          ? "clue_scrolls_hard"
          : undefined;
    const clueScore = clueMetric ? player?.activities?.[clueMetric]?.score : undefined;
    if (clueScore) {
      signals.push(`${clueScore.toLocaleString()} ${activity.title.toLowerCase()} completed`);
    }
  }

  if (activity.type === "clue" && player?.collectionLog) {
    signals.push(`${player.collectionLog.uniqueObtained.toLocaleString()} collection slots synced`);
  }

  if (activity.type === "skilling" && player?.achievements?.near.length) {
    const skillAchievement = player.achievements.near.find((achievement) => activity.title.toLowerCase().includes(achievement.metric.replace(/_/g, " ")));
    if (skillAchievement) {
      signals.push(`${Math.round(skillAchievement.progress * 100)}% to ${skillAchievement.name}`);
    }
  }

  return signals.slice(0, 4);
}

function getWhyNow(activity: Activity, tier: RecommendationTier) {
  if (tier === "readyNow") {
    const metRequirements = (activity.requirements ?? []).filter((requirement) => requirement.met);
    if (metRequirements.length > 0) {
      const requirementSummary = metRequirements.slice(0, 3).map((requirement) => requirement.label).join(", ");
      const metricSummary = activity.metrics?.gpPerHour ? ` It is listed at ${formatGpPerHour(activity.metrics.gpPerHour)}.` : "";
      return `This account meets the visible checks for ${activity.title}: ${requirementSummary}.${metricSummary}`;
    }

    const metricSummary = activity.metrics?.gpPerHour ? ` It is listed at ${formatGpPerHour(activity.metrics.gpPerHour)}.` : "";
    return `This account has no visible blockers for ${activity.title}.${metricSummary}`;
  }

  if (activity.recommendationReason) {
    return activity.recommendationReason;
  }

  if (tier === "nearUnlock") {
    const missing = getMissingRequirements(activity)[0];
    return missing
      ? `${activity.title} is not shown as available because ${missing.label} is unmet.`
      : `${activity.title} has an unconfirmed requirement.`;
  }

  return `${activity.title} is not currently available from the visible account checks.`;
}

function getNextStep(activity: Activity, tier: RecommendationTier) {
  return tier === "readyNow"
    ? `Find it at ${activity.locationName} on the map.`
    : `${activity.locationName} is the map location once the account checks are met.`;
}

function withRecommendationFields(activity: Activity, player: PlayerLookup | null): Activity {
  const recommendationTier = activity.recommendationTier ?? getRecommendationTier(activity);
  const missingRequirements = getMissingRequirements(activity);

  return {
    ...activity,
    recommendationTier,
    whyNow: activity.whyNow ?? getWhyNow(activity, recommendationTier),
    accountSignals: activity.accountSignals ?? getAccountSignals(activity, player),
    missingRequirements,
    unlockProgress: activity.unlockProgress ?? getUnlockProgress(activity),
    nextStep: activity.nextStep ?? getNextStep(activity, recommendationTier)
  };
}

function isCombatMoneyMaker(activity: Activity) {
  const combatMoneyIds = new Set([
    "vorkath-money",
    "zulrah-money",
    "barrows-money",
    "rune-dragons-money",
    "gauntlet-money",
    "revenants-money"
  ]);

  return combatMoneyIds.has(activity.id);
}

function getCombatRequirement(activity: Activity) {
  const difficulty = activity.metrics?.difficulty ?? 1;
  if (activity.type === "boss") {
    return difficulty >= 5 ? 95 : difficulty >= 4 ? 80 : difficulty >= 3 ? 65 : difficulty >= 2 ? 45 : 0;
  }

  if (activity.type === "money" && isCombatMoneyMaker(activity)) {
    return difficulty >= 5 ? 95 : difficulty >= 4 ? 80 : difficulty >= 3 ? 70 : difficulty >= 2 ? 50 : 0;
  }

  return 0;
}

function hasCombatRequirementMet(activity: Activity, player: PlayerLookup | null) {
  const combatRequirement = getCombatRequirement(activity);
  if (combatRequirement === 0) {
    return true;
  }

  if (!player) {
    return false;
  }

  const combatLevel = player.combatLevel ?? getCombatAverage(player);
  return combatLevel >= combatRequirement;
}

function uniqueByTitle(activities: Activity[]) {
  const seenTitles = new Set<string>();
  return activities.filter((activity) => {
    const key = activity.title.toLowerCase();
    if (seenTitles.has(key)) {
      return false;
    }

    seenTitles.add(key);
    return true;
  });
}

function sortTabActivities(type: ActivityType, activities: Activity[]) {
  return [...activities].sort((a, b) => {
    if (type === "money") {
      return (b.metrics?.gpPerHour ?? 0) - (a.metrics?.gpPerHour ?? 0) || getValueScore(b) - getValueScore(a);
    }

    if (type === "boss") {
      return (b.metrics?.gpPerHour ?? 0) - (a.metrics?.gpPerHour ?? 0) || (b.metrics?.difficulty ?? 0) - (a.metrics?.difficulty ?? 0);
    }

    return Number(a.status === "blocked") - Number(b.status === "blocked") || (a.metrics?.estimatedMinutes ?? 999) - (b.metrics?.estimatedMinutes ?? 999);
  });
}

export function getTabActivities(context: ActivityContext, type: ActivityType): Activity[] {
  const activities = uniqueByTitle(
    getActivities(context)
      .filter((activity) => activity.type === type && activity.state !== "completed")
      .map((activity) => withRecommendationFields(activity, context.player))
  );

  if (type === "quest" || type === "money" || type === "boss") {
    return sortTabActivities(
      type,
      activities.filter((activity) => activity.status === "ready" && hasCombatRequirementMet(activity, context.player))
    );
  }

  return sortTabActivities(type, activities);
}

function sortRecommendationGroup(activities: Activity[]) {
  return [...activities].sort((a, b) => {
    const tierOrder = (activity: Activity) => {
      if (activity.recommendationTier === "readyNow") {
        return 3;
      }
      if (activity.recommendationTier === "nearUnlock") {
        return 2;
      }
      return 1;
    };

    return (
      tierOrder(b) - tierOrder(a) ||
      (b.unlockProgress ?? 0) - (a.unlockProgress ?? 0) ||
      getValueScore(b) - getValueScore(a)
    );
  });
}

export function getRecommendations(context: ActivityContext): RecommendationGroup[] {
  const recommendations = uniqueByTitle(
    getActivities(context)
      .filter((activity) => activity.state !== "completed")
      .map((activity) => withRecommendationFields(activity, context.player))
  );

  return RECOMMENDATION_GROUPS.map((group) => ({
    ...group,
    activities: ACTIVITY_LAYERS.flatMap((layer) =>
      sortRecommendationGroup(
        recommendations.filter((activity) => activity.recommendationTier === group.tier && activity.type === layer.type)
      ).slice(0, RECOMMENDATION_LIMIT)
    )
  }));
}

export function flattenRecommendationGroups(groups: RecommendationGroup[]) {
  return groups.flatMap((group) => group.activities);
}
