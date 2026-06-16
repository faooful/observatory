import { NextResponse } from "next/server";
import pins from "@/data/activities/osrs-pins.json";
import {
  normalizeQuestName,
  normalizeQuestState,
  SKILL_ORDER,
  type AccountSourceStatus,
  type ActivitySnapshot,
  type AchievementSnapshot,
  type BossSnapshot,
  type CollectionLogSnapshot,
  type EfficiencySnapshot,
  type PlayerLookup,
  type QuestMarker,
  type SkillSnapshot
} from "@/lib/osrs/player";
import { getSourceLinks } from "@/lib/osrs/sources";
import { parseWikiQuestDetails, type WikiQuestDetails } from "@/lib/osrs/wikiQuestDetails";
import type { ActivityPin } from "@/lib/terrain/types";

const HISCORE_URL = "https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws";
const WIKISYNC_URL = "https://sync.runescape.wiki/runelite/player";
const OSRS_WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const WISE_OLD_MAN_API_URL = "https://api.wiseoldman.net/v2";
const TEMPLE_COLLECTION_LOG_URL = "https://templeosrs.com/api/collection-log/player_collection_log.php";
const COLLECTION_LOG_NET_API_URL = "https://api.collectionlog.net";
const OSRS_WIKI_PRICES_MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const EXPLV_MAP_URL = "https://explv.github.io/";
const USER_AGENT = "The Observatory OSRS map prototype (local development)";
const questPins = (pins as ActivityPin[]).filter((pin) => pin.type === "quest" && pin.questName);
const PLAYER_SOURCE_LINKS = getSourceLinks([
  "hiscores",
  "wikisync",
  "osrsWiki",
  "wiseOldMan",
  "templeOsrs",
  "collectionLogNet",
  "runeProfile",
  "explv",
  "osrsMapTiles",
  "daxWalker"
]);
const QUEST_MARKER_SOURCE_LINKS = getSourceLinks(["wikisync", "osrsWiki", "explv"]);
const questPinsByName = new Map(questPins.map((pin) => [normalizeQuestName(pin.questName ?? pin.label), pin]));

type QuestCandidate = {
  normalizedName: string;
  title: string;
  localPin?: ActivityPin;
};

type WiseOldManMetric = {
  rank?: number;
  kills?: number;
  score?: number;
};

type WiseOldManPlayer = {
  type?: string;
  build?: string;
  combatLevel?: number;
  ehp?: number;
  ehb?: number;
  ttm?: number;
  latestSnapshot?: {
    data?: {
      bosses?: Record<string, WiseOldManMetric>;
      activities?: Record<string, WiseOldManMetric>;
    };
  };
};

type WiseOldManAchievementProgress = {
  name?: string;
  metric?: string;
  threshold?: number;
  measure?: string;
  currentValue?: number;
  absoluteProgress?: number;
  relativeProgress?: number;
};

type TempleCollectionItem = {
  id?: number;
  count?: number;
  date?: string;
};

type CollectionLogNetItem = {
  id?: number;
  name?: string;
  quantity?: number;
  obtained?: boolean;
  sequence?: number;
};

type CollectionLogNetKillCount = {
  name?: string;
  amount?: number;
};

type CollectionLogNetPage = {
  items?: CollectionLogNetItem[];
  killCount?: CollectionLogNetKillCount[];
};

type CollectionLogNetPayload = {
  collectionLog?: {
    accountType?: string;
    uniqueObtained?: number;
    uniqueItems?: number;
    tabs?: Record<string, Record<string, CollectionLogNetPage>>;
  };
};

type CollectionLogNetRecentItem = {
  item?: CollectionLogNetItem;
  itemId?: number;
  id?: number;
  name?: string;
  quantity?: number;
  obtained?: boolean;
  date?: string;
  createdAt?: string;
  tab?: string;
  category?: string;
  page?: string;
};

type OsrsWikiPriceMappingItem = {
  id?: number;
  name?: string;
};

type AccountEnrichment = Pick<PlayerLookup, "combatLevel" | "accountType" | "bosses" | "activities" | "efficiency" | "achievements" | "collectionLog"> & {
  sourceStatuses: AccountSourceStatus[];
};

const HISCORE_ACTIVITY_METRICS: Array<string | null> = [
  "league_points",
  "bounty_hunter_hunter",
  "bounty_hunter_rogue",
  null,
  null,
  null,
  null,
  "clue_scrolls_all",
  "clue_scrolls_beginner",
  "clue_scrolls_easy",
  "clue_scrolls_medium",
  "clue_scrolls_hard",
  "clue_scrolls_elite",
  "clue_scrolls_master",
  "last_man_standing",
  "pvp_arena",
  null,
  "guardians_of_the_rift",
  "colosseum_glory",
  "collections_logged"
];

const HISCORE_BOSS_METRICS = [
  "abyssal_sire",
  "alchemical_hydra",
  "amoxliatl",
  "araxxor",
  "artio",
  "barrows_chests",
  "brutus",
  "bryophyta",
  "callisto",
  "calvarion",
  "cerberus",
  "chambers_of_xeric",
  "chambers_of_xeric_challenge_mode",
  "chaos_elemental",
  "chaos_fanatic",
  "commander_zilyana",
  "corporeal_beast",
  "crazy_archaeologist",
  "dagannoth_prime",
  "dagannoth_rex",
  "dagannoth_supreme",
  "deranged_archaeologist",
  "doom_of_mokhaiotl",
  "duke_sucellus",
  "general_graardor",
  "giant_mole",
  "grotesque_guardians",
  "hespori",
  "kalphite_queen",
  "king_black_dragon",
  "kraken",
  "kreearra",
  "kril_tsutsaroth",
  "lunar_chests",
  "mimic",
  "nex",
  "nightmare",
  "phosanis_nightmare",
  "obor",
  "phantom_muspah",
  "sarachnis",
  "scorpia",
  "scurrius",
  "shellbane_gryphon",
  "skotizo",
  "sol_heredit",
  "spindel",
  "tempoross",
  "the_gauntlet",
  "the_corrupted_gauntlet",
  "the_hueycoatl",
  "the_leviathan",
  "the_royal_titans",
  "the_whisperer",
  "theatre_of_blood",
  "theatre_of_blood_hard_mode",
  "thermonuclear_smoke_devil",
  "tombs_of_amascut",
  "tombs_of_amascut_expert",
  "tzkal_zuk",
  "tztok_jad",
  "vardorvis",
  "venenatis",
  "vetion",
  "vorkath",
  "wintertodt",
  "yama",
  "zalcano",
  "zulrah"
];

function parseRankedScore(line: string | undefined) {
  const [rank = "-1", score = "0"] = (line ?? "").split(",");
  return {
    rank: Number(rank),
    score: Number(score)
  };
}

function parseHiscores(csv: string) {
  const skills: PlayerLookup["skills"] = {};
  const lines = csv.trim().split(/\r?\n/);

  SKILL_ORDER.forEach((skillName, index) => {
    const [rank = "-1", level = "-1", experience = "-1"] = (lines[index] ?? "").split(",");
    skills[skillName] = {
      rank: Number(rank),
      level: Number(level),
      experience: Number(experience)
    } satisfies SkillSnapshot;
  });

  const activityOffset = SKILL_ORDER.length;
  const activityEntries: Array<[string, ActivitySnapshot]> = HISCORE_ACTIVITY_METRICS.flatMap((metric, metricIndex): Array<[string, ActivitySnapshot]> => {
      if (!metric) {
        return [];
      }

      const activity = parseRankedScore(lines[activityOffset + metricIndex]);
      if (activity.score <= 0) {
        return [];
      }

      return [[
        metric,
        {
          rank: activity.rank,
          score: activity.score
        } satisfies ActivitySnapshot
      ]];
    });
  const activities = Object.fromEntries(activityEntries);
  const bossOffset = activityOffset + HISCORE_ACTIVITY_METRICS.length;
  const bossEntries: Array<[string, BossSnapshot]> = HISCORE_BOSS_METRICS.map((metric, metricIndex): [string, BossSnapshot] => {
      const boss = parseRankedScore(lines[bossOffset + metricIndex]);
      return [
        metric,
        {
          rank: boss.rank,
          kills: boss.score
        } satisfies BossSnapshot
      ];
    }).filter(([, boss]) => boss.kills > 0);
  const bosses = Object.fromEntries(bossEntries);

  return {
    skills,
    activities,
    bosses
  };
}

async function fetchHiscores(username: string) {
  const response = await fetch(`${HISCORE_URL}?player=${encodeURIComponent(username)}`, {
    headers: {
      "User-Agent": USER_AGENT
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(response.status === 404 ? "Player was not found on the OSRS hiscores." : "Could not load OSRS hiscores.");
  }

  return parseHiscores(await response.text());
}

async function fetchWikiSyncQuests(username: string) {
  const response = await fetch(`${WIKISYNC_URL}/${encodeURIComponent(username)}/STANDARD`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      quests: {},
      questTitles: {},
      questSource: "unavailable" as const,
      questMessage: "No WikiSync quest data found. Enable WikiSync in RuneLite to populate completed quests."
    };
  }

  const payload = (await response.json()) as { quests?: Record<string, unknown>; timestamp?: string };
  const questEntries = Object.entries(payload.quests ?? {});
  return {
    quests: Object.fromEntries(questEntries.map(([questName, state]) => [normalizeQuestName(questName), normalizeQuestState(state)])),
    questTitles: Object.fromEntries(questEntries.map(([questName]) => [normalizeQuestName(questName), questName])),
    questSource: "wikisync" as const,
    questSyncedAt: payload.timestamp
  };
}

function compactBosses(bosses: Record<string, WiseOldManMetric> | undefined) {
  if (!bosses) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(bosses)
      .filter(([, boss]) => typeof boss.kills === "number" && boss.kills > 0)
      .map(([metric, boss]) => [
        metric,
        {
          rank: boss.rank ?? -1,
          kills: boss.kills ?? 0
        } satisfies BossSnapshot
      ])
  );
}

function compactActivities(activities: Record<string, WiseOldManMetric> | undefined) {
  if (!activities) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(activities)
      .filter(([, activity]) => typeof activity.score === "number" && activity.score > 0)
      .map(([metric, activity]) => [
        metric,
        {
          rank: activity.rank ?? -1,
          score: activity.score ?? 0
        } satisfies ActivitySnapshot
      ])
  );
}

function compactAchievements(progress: WiseOldManAchievementProgress[]) {
  const validProgress = progress.filter(
    (achievement) =>
      achievement.name &&
      achievement.metric &&
      achievement.measure &&
      typeof achievement.threshold === "number" &&
      typeof achievement.currentValue === "number" &&
      typeof achievement.absoluteProgress === "number"
  );
  const completedCount = validProgress.filter((achievement) => (achievement.absoluteProgress ?? 0) >= 1).length;
  const near = validProgress
    .filter((achievement) => {
      const progressValue = achievement.absoluteProgress ?? 0;
      return progressValue > 0 && progressValue < 1;
    })
    .sort((left, right) => (right.absoluteProgress ?? 0) - (left.absoluteProgress ?? 0))
    .slice(0, 12)
    .map((achievement) => ({
      name: achievement.name ?? "Achievement",
      metric: achievement.metric ?? "",
      measure: achievement.measure ?? "",
      threshold: achievement.threshold ?? 0,
      currentValue: achievement.currentValue ?? 0,
      progress: achievement.absoluteProgress ?? 0
    }));

  return {
    completedCount,
    near
  } satisfies AchievementSnapshot;
}

async function fetchWiseOldManEnrichment(username: string) {
  const encodedUsername = encodeURIComponent(username);

  const updateResponse = await fetch(`${WISE_OLD_MAN_API_URL}/players/${encodedUsername}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT
    },
    cache: "no-store"
  });
  const response = updateResponse.ok
    ? updateResponse
    : await fetch(`${WISE_OLD_MAN_API_URL}/players/${encodedUsername}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT
        },
        cache: "no-store"
      });

  if (!response.ok) {
    throw new Error(response.status === 404 ? "No Wise Old Man profile found." : "Could not update Wise Old Man profile.");
  }

  const payload = (await response.json()) as WiseOldManPlayer;
  let achievements: AchievementSnapshot | undefined;
  try {
    const achievementsResponse = await fetch(`${WISE_OLD_MAN_API_URL}/players/${encodedUsername}/achievements/progress`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      cache: "no-store"
    });
    if (achievementsResponse.ok) {
      achievements = compactAchievements((await achievementsResponse.json()) as WiseOldManAchievementProgress[]);
    }
  } catch {
    achievements = undefined;
  }

  const bosses = compactBosses(payload.latestSnapshot?.data?.bosses);
  const activities = compactActivities(payload.latestSnapshot?.data?.activities);
  const efficiency: EfficiencySnapshot = {
    ...(typeof payload.ehp === "number" ? { ehp: payload.ehp } : {}),
    ...(typeof payload.ehb === "number" ? { ehb: payload.ehb } : {}),
    ...(typeof payload.ttm === "number" ? { ttm: payload.ttm } : {})
  };

  return {
    combatLevel: payload.combatLevel,
    accountType: [payload.type, payload.build].filter(Boolean).join(" / ") || undefined,
    bosses,
    activities,
    achievements,
    efficiency: Object.keys(efficiency).length ? efficiency : undefined
  } satisfies Partial<AccountEnrichment>;
}

function getTempleCollectionSummaries(items: Record<string, TempleCollectionItem[]> | undefined) {
  if (!items) {
    return {};
  }

  const categoryCounts = Object.fromEntries(
    Object.entries(items).map(([category, categoryItems]) => [category, Array.isArray(categoryItems) ? categoryItems.length : 0])
  );
  const topCategories = Object.entries(categoryCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([id, obtained]) => ({ id, obtained }));
  const recentItems = Object.entries(items)
    .flatMap(([category, categoryItems]) =>
      (Array.isArray(categoryItems) ? categoryItems : []).map((item) => ({
        category,
        id: item.id ?? 0,
        count: item.count ?? 0,
        date: item.date
      }))
    )
    .filter((item) => item.id > 0)
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))
    .slice(0, 12);
  const categoryItems = Object.fromEntries(
    Object.entries(items).map(([category, categoryItems]) => [
      category,
      (Array.isArray(categoryItems) ? categoryItems : [])
        .filter((item) => typeof item.id === "number" && item.id > 0)
        .map((item) => ({
          id: item.id ?? 0,
          count: item.count ?? 1,
          date: item.date,
          obtained: true
        }))
    ])
  );

  return {
    categoryCounts,
    topCategories,
    recentItems,
    categoryItems
  };
}

async function fetchTempleCollectionLog(username: string) {
  const params = new URLSearchParams({
    player: username,
    categories: "all"
  });
  const response = await fetch(`${TEMPLE_COLLECTION_LOG_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("No TempleOSRS collection log found.");
  }

  const payload = (await response.json()) as {
    data?: {
      last_checked?: string;
      total_collections_finished?: number;
      total_collections_available?: number;
      total_categories_finished?: number;
      total_categories_available?: number;
      ehc?: number;
      items?: Record<string, TempleCollectionItem[]>;
    };
  };
  const data = payload.data;
  if (!data || typeof data.total_collections_finished !== "number" || typeof data.total_collections_available !== "number") {
    throw new Error("TempleOSRS collection log did not include item totals.");
  }

  return {
    source: "temple-osrs",
    uniqueObtained: data.total_collections_finished,
    uniqueItems: data.total_collections_available,
    lastSynced: data.last_checked,
    categoriesFinished: data.total_categories_finished,
    categoriesAvailable: data.total_categories_available,
    ehc: data.ehc,
    ...getTempleCollectionSummaries(data.items)
  } satisfies CollectionLogSnapshot;
}

function compactCollectionLogNet(payload: CollectionLogNetPayload, recentItems: CollectionLogNetRecentItem[] = []) {
  const collectionLog = payload.collectionLog;
  if (
    !collectionLog ||
    typeof collectionLog.uniqueObtained !== "number" ||
    typeof collectionLog.uniqueItems !== "number" ||
    !collectionLog.tabs
  ) {
    throw new Error("collectionlog.net did not include collection log totals.");
  }

  const pages = Object.entries(collectionLog.tabs).flatMap(([tab, tabPages]) =>
    Object.entries(tabPages ?? {}).map(([pageName, page]) => {
      const obtainedItems = (page.items ?? []).filter((item) => item.obtained);
      const obtainedCount = obtainedItems.length;
      const total = page.items?.length ?? 0;
      return {
        id: `${tab}: ${pageName}`,
        obtained: obtainedCount,
        total,
        items: page.items ?? [],
        obtainedItems,
        missingItems: (page.items ?? []).filter((item) => !item.obtained)
      };
    })
  );
  const categoryCounts = Object.fromEntries(pages.map((page) => [page.id, page.obtained]));
  const categoryTotals = Object.fromEntries(
    pages.flatMap((page): Array<[string, number]> => (page.total > 0 ? [[page.id, page.total]] : []))
  );
  const topCategories = pages
    .filter((page) => page.obtained > 0)
    .sort((left, right) => {
      const leftMissing = left.total > 0 ? left.total - left.obtained : Number.POSITIVE_INFINITY;
      const rightMissing = right.total > 0 ? right.total - right.obtained : Number.POSITIVE_INFINITY;
      return leftMissing - rightMissing || right.obtained - left.obtained;
    })
    .slice(0, 12)
    .map(({ id, obtained, total }) => ({ id, obtained, ...(total > 0 ? { total } : {}) }));

  const fallbackRecentItems = pages
    .flatMap((page) =>
      page.obtainedItems.map((item) => ({
        category: page.id,
        id: item.id ?? 0,
        count: item.quantity ?? 1,
        name: item.name,
        obtained: item.obtained
      }))
    )
    .filter((item) => item.id > 0)
    .slice(0, 12);
  const categoryItems = Object.fromEntries(
    pages.map((page) => [
      page.id,
      page.obtainedItems
        .filter((item) => typeof item.id === "number" && item.id > 0)
        .map((item) => ({
          id: item.id ?? 0,
          count: item.quantity ?? 1,
          name: item.name,
          obtained: item.obtained
        }))
    ])
  );
  const categoryMissingItems = Object.fromEntries(
    pages.map((page) => [
      page.id,
      page.missingItems
        .filter((item) => typeof item.id === "number" && item.id > 0)
        .map((item) => ({
          id: item.id ?? 0,
          name: item.name
        }))
    ])
  );
  const syncedRecentItems = recentItems
    .map((entry) => ({
      category: [entry.tab, entry.category, entry.page].filter(Boolean).join(": ") || "Recent item",
      id: entry.item?.id ?? entry.itemId ?? entry.id ?? 0,
      count: entry.item?.quantity ?? entry.quantity ?? 1,
      name: entry.item?.name ?? entry.name,
      obtained: entry.item?.obtained ?? entry.obtained,
      date: entry.date ?? entry.createdAt
    }))
    .filter((item) => item.id > 0)
    .slice(0, 12);

  return {
    source: "collectionlog-net",
    uniqueObtained: collectionLog.uniqueObtained,
    uniqueItems: collectionLog.uniqueItems,
    categoryCounts,
    categoryTotals,
    categoryItems,
    categoryMissingItems,
    topCategories,
    recentItems: syncedRecentItems.length ? syncedRecentItems : fallbackRecentItems
  } satisfies CollectionLogSnapshot;
}

async function fetchCollectionLogNet(username: string) {
  const encodedUsername = encodeURIComponent(username);
  const response = await fetch(`${COLLECTION_LOG_NET_API_URL}/collectionlog/user/${encodedUsername}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(response.status === 404 ? "No collectionlog.net profile found." : "Could not load collectionlog.net profile.");
  }

  const payload = (await response.json()) as CollectionLogNetPayload;
  let recentItems: CollectionLogNetRecentItem[] = [];
  try {
    const recentResponse = await fetch(`${COLLECTION_LOG_NET_API_URL}/items/recent/${encodedUsername}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      cache: "no-store"
    });
    if (recentResponse.ok) {
      const recentPayload = await recentResponse.json();
      recentItems = Array.isArray(recentPayload) ? recentPayload : [];
    }
  } catch {
    recentItems = [];
  }

  return compactCollectionLogNet(payload, recentItems);
}

async function fetchItemNameMap() {
  const response = await fetch(OSRS_WIKI_PRICES_MAPPING_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    throw new Error("Could not load OSRS Wiki item mapping.");
  }

  const payload = (await response.json()) as OsrsWikiPriceMappingItem[];
  return new Map(
    payload
      .filter((item): item is { id: number; name: string } => typeof item.id === "number" && typeof item.name === "string")
      .map((item) => [item.id, item.name])
  );
}

async function enrichCollectionLogItemNames(collectionLog: CollectionLogSnapshot | undefined) {
  if (!collectionLog?.categoryItems && !collectionLog?.recentItems?.length) {
    return collectionLog;
  }

  try {
    const itemNames = await fetchItemNameMap();
    const categoryItems = collectionLog.categoryItems
      ? Object.fromEntries(
          Object.entries(collectionLog.categoryItems).map(([category, items]) => [
            category,
            items.map((item) => ({
              ...item,
              name: item.name ?? itemNames.get(item.id)
            }))
          ])
        )
      : undefined;
    const recentItems = collectionLog.recentItems?.map((item) => ({
      ...item,
      name: item.name ?? itemNames.get(item.id)
    }));
    const categoryMissingItems = collectionLog.categoryMissingItems
      ? Object.fromEntries(
          Object.entries(collectionLog.categoryMissingItems).map(([category, items]) => [
            category,
            items.map((item) => ({
              ...item,
              name: item.name ?? itemNames.get(item.id)
            }))
          ])
        )
      : undefined;

    return {
      ...collectionLog,
      ...(categoryItems ? { categoryItems } : {}),
      ...(recentItems ? { recentItems } : {}),
      ...(categoryMissingItems ? { categoryMissingItems } : {})
    } satisfies CollectionLogSnapshot;
  } catch {
    return collectionLog;
  }
}

async function settleSource<T>(
  sourceId: AccountSourceStatus["sourceId"],
  loader: () => Promise<T>
): Promise<{ value?: T; status: AccountSourceStatus }> {
  try {
    return {
      value: await loader(),
      status: { sourceId, status: "available" }
    };
  } catch (error) {
    return {
      status: {
        sourceId,
        status: "unavailable",
        message: error instanceof Error ? error.message : "Source unavailable."
      }
    };
  }
}

async function fetchAccountEnrichment(username: string): Promise<AccountEnrichment> {
  const [wiseOldMan, collectionLogNet, templeCollectionLog] = await Promise.all([
    settleSource("wise-old-man", () => fetchWiseOldManEnrichment(username)),
    settleSource("collectionlog-net", () => fetchCollectionLogNet(username)),
    settleSource("temple-osrs", () => fetchTempleCollectionLog(username))
  ]);
  const collectionLog = collectionLogNet.value ?? templeCollectionLog.value;

  return {
    ...(wiseOldMan.value ?? {}),
    ...(collectionLog ? { collectionLog } : {}),
    sourceStatuses: [wiseOldMan.status, collectionLogNet.status, templeCollectionLog.status]
  };
}

function mergeCollectionLogWithHiscores(
  collectionLog: CollectionLogSnapshot | undefined,
  activities: Record<string, ActivitySnapshot>
) {
  const officialLoggedSlots = activities.collections_logged?.score;
  if (!collectionLog || !officialLoggedSlots || officialLoggedSlots <= collectionLog.uniqueObtained) {
    return collectionLog;
  }

  return {
    ...collectionLog,
    uniqueObtained: officialLoggedSlots,
    lastSynced: collectionLog.lastSynced
      ? `${collectionLog.lastSynced} (page breakdown sync; total updated from official hiscores)`
      : "Total updated from official hiscores"
  } satisfies CollectionLogSnapshot;
}

function getWikiTitle(pin: ActivityPin) {
  if (pin.wikiUrl) {
    return decodeURIComponent(pin.wikiUrl.split("/").pop() ?? pin.questName ?? pin.label).replace(/_/g, " ");
  }

  return pin.questName ?? pin.label;
}

function getExplvMapUrl(coordinates: { x: number; y: number; plane?: number }) {
  const params = new URLSearchParams({
    centreX: String(coordinates.x),
    centreY: String(coordinates.y),
    centreZ: String(coordinates.plane ?? 0),
    zoom: "9"
  });

  return `${EXPLV_MAP_URL}?${params.toString()}`;
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  mapper: (input: TInput) => Promise<TOutput>
) {
  const outputs: TOutput[] = [];
  let index = 0;

  async function worker() {
    while (index < inputs.length) {
      const currentIndex = index;
      index += 1;
      outputs[currentIndex] = await mapper(inputs[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return outputs;
}

async function fetchWikiSummaries(titles: string[]) {
  if (titles.length === 0) {
    return new Map<string, { description?: string; wikiUrl?: string }>();
  }

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    redirects: "1",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    titles: titles.join("|"),
    origin: "*"
  });
  const response = await fetch(`${OSRS_WIKI_API_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    return new Map<string, { description?: string; wikiUrl?: string }>();
  }

  const payload = (await response.json()) as {
    query?: {
      pages?: Record<string, { title?: string; extract?: string; fullurl?: string }>;
    };
  };
  const byTitle = new Map<string, { description?: string; wikiUrl?: string }>();

  Object.values(payload.query?.pages ?? {}).forEach((page) => {
    if (!page.title) {
      return;
    }

    const firstParagraph = page.extract?.split(/\n+/).find((line) => line.trim().length > 0)?.trim();
    byTitle.set(normalizeQuestName(page.title), {
      description: firstParagraph,
      wikiUrl: page.fullurl
    });
  });

  return byTitle;
}

async function fetchWikiQuestDetail(title: string): Promise<WikiQuestDetails | null> {
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    page: title,
    prop: "wikitext",
    origin: "*"
  });
  const response = await fetch(`${OSRS_WIKI_API_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    parse?: {
      wikitext?: {
        "*": string;
      };
    };
  };

  return parseWikiQuestDetails(payload.parse?.wikitext?.["*"] ?? "");
}

async function fetchWikiQuestDetails(candidates: QuestCandidate[]) {
  const entries = await mapWithConcurrency(
    candidates,
    8,
    async (candidate) => [candidate.normalizedName, await fetchWikiQuestDetail(candidate.title)] as const
  );

  return new Map(entries.filter((entry): entry is readonly [string, WikiQuestDetails] => entry[1] !== null));
}

function getMarkerCoordinateSource(localPin: ActivityPin | undefined, wikiUrl: string | undefined, wikiDetails?: WikiQuestDetails) {
  if (wikiDetails?.startMap) {
    return {
      label: "OSRS Wiki Quest details startmap",
      url: wikiUrl ?? localPin?.wikiUrl,
      confidence: "wiki" as const,
      note: "Coordinates come from the OSRS Wiki Quest details template for this quest."
    };
  }

  return localPin?.coordinateSource;
}

function getQuestId(candidate: QuestCandidate) {
  return candidate.localPin?.id ?? candidate.normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getQuestCandidates(quests: Record<string, number>, questTitles: Record<string, string>) {
  return Object.entries(quests)
    .filter(([questName, state]) => questName !== "." && state !== 2)
    .map(([normalizedName]) => {
      const localPin = questPinsByName.get(normalizedName);
      return {
        normalizedName,
        title: questTitles[normalizedName] ?? localPin?.questName ?? localPin?.label ?? normalizedName,
        localPin
      } satisfies QuestCandidate;
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

async function buildQuestMarkerPayload(quests: Record<string, number>, questTitles: Record<string, string>) {
  const candidates = getQuestCandidates(quests, questTitles);
  const [wikiSummaries, wikiDetails] = await Promise.all([
    fetchWikiSummaries(candidates.map((candidate) => candidate.title)),
    fetchWikiQuestDetails(candidates)
  ]);
  const questMarkers: QuestMarker[] = [];
  const unmappedIncompleteQuests: string[] = [];

  candidates.forEach((candidate) => {
    const wiki = wikiSummaries.get(candidate.normalizedName);
    const details = wikiDetails.get(candidate.normalizedName);
    const fallbackCoordinates = candidate.localPin
      ? { x: candidate.localPin.x, y: candidate.localPin.y, plane: candidate.localPin.plane }
      : null;
    const coordinates = details?.startMap ?? fallbackCoordinates;

    if (!coordinates) {
      unmappedIncompleteQuests.push(candidate.title);
      return;
    }

    const wikiUrl = wiki?.wikiUrl ?? candidate.localPin?.wikiUrl;

    questMarkers.push({
      id: getQuestId(candidate),
      label: wiki?.wikiUrl ? candidate.title : candidate.localPin?.label ?? candidate.title,
      x: coordinates.x,
      y: coordinates.y,
      plane: coordinates.plane ?? candidate.localPin?.plane ?? 0,
      description: wiki?.description ?? candidate.localPin?.description ?? `Incomplete quest from WikiSync: ${candidate.title}.`,
      wikiUrl,
      mapUrl: getExplvMapUrl(coordinates),
      questName: candidate.title,
      questState: quests[candidate.normalizedName] === 1 ? 1 : 0,
      source: "osrs-wiki+wikisync",
      sourceIds: QUEST_MARKER_SOURCE_LINKS.map((source) => source.id),
      sourceLinks: QUEST_MARKER_SOURCE_LINKS,
      wikiDetails: details,
      coordinateSource: getMarkerCoordinateSource(candidate.localPin, wikiUrl, details)
    });
  });

  return {
    questMarkers,
    unmappedIncompleteQuests
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim();

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  try {
    const [hiscores, questData, enrichment] = await Promise.all([
      fetchHiscores(username),
      fetchWikiSyncQuests(username),
      fetchAccountEnrichment(username)
    ]);
    const markerData = questData.questSource === "wikisync"
      ? await buildQuestMarkerPayload(questData.quests, questData.questTitles)
      : { questMarkers: [], unmappedIncompleteQuests: [] };
    const bosses = {
      ...(enrichment.bosses ?? {}),
      ...hiscores.bosses
    };
    const activities = {
      ...(enrichment.activities ?? {}),
      ...hiscores.activities
    };
    const collectionLog = await enrichCollectionLogItemNames(mergeCollectionLogWithHiscores(enrichment.collectionLog, activities));

    return NextResponse.json({
      username,
      fetchedAt: new Date().toISOString(),
      skills: hiscores.skills,
      ...enrichment,
      collectionLog,
      bosses,
      activities,
      sourceLinks: PLAYER_SOURCE_LINKS,
      ...markerData,
      ...questData
    } satisfies PlayerLookup);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load player data." },
      { status: 502 }
    );
  }
}
