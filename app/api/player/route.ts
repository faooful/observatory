import { NextResponse } from "next/server";
import pins from "@/data/activities/osrs-pins.json";
import { normalizeQuestName, SKILL_ORDER, type PlayerLookup, type QuestMarker, type SkillSnapshot } from "@/lib/osrs/player";
import { getSourceLinks } from "@/lib/osrs/sources";
import { parseWikiQuestDetails, type WikiQuestDetails } from "@/lib/osrs/wikiQuestDetails";
import type { ActivityPin } from "@/lib/terrain/types";

const HISCORE_URL = "https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws";
const WIKISYNC_URL = "https://sync.runescape.wiki/runelite/player";
const OSRS_WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const EXPLV_MAP_URL = "https://explv.github.io/";
const USER_AGENT = "The Observatory OSRS map prototype (local development)";
const questPins = (pins as ActivityPin[]).filter((pin) => pin.type === "quest" && pin.questName);
const PLAYER_SOURCE_LINKS = getSourceLinks(["hiscores", "wikisync", "osrsWiki", "explv", "osrsMapTiles", "daxWalker"]);
const QUEST_MARKER_SOURCE_LINKS = getSourceLinks(["wikisync", "osrsWiki", "explv"]);
const questPinsByName = new Map(questPins.map((pin) => [normalizeQuestName(pin.questName ?? pin.label), pin]));

type QuestCandidate = {
  normalizedName: string;
  title: string;
  localPin?: ActivityPin;
};

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

  return skills;
}

async function fetchHiscores(username: string) {
  const response = await fetch(`${HISCORE_URL}?player=${encodeURIComponent(username)}`, {
    headers: {
      "User-Agent": USER_AGENT
    },
    next: { revalidate: 60 }
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

  const payload = (await response.json()) as { quests?: Record<string, number> };
  const questEntries = Object.entries(payload.quests ?? {});
  return {
    quests: Object.fromEntries(questEntries.map(([questName, state]) => [normalizeQuestName(questName), state])),
    questTitles: Object.fromEntries(questEntries.map(([questName]) => [normalizeQuestName(questName), questName])),
    questSource: "wikisync" as const
  };
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
    const [skills, questData] = await Promise.all([fetchHiscores(username), fetchWikiSyncQuests(username)]);
    const markerData = questData.questSource === "wikisync"
      ? await buildQuestMarkerPayload(questData.quests, questData.questTitles)
      : { questMarkers: [], unmappedIncompleteQuests: [] };

    return NextResponse.json({
      username,
      fetchedAt: new Date().toISOString(),
      skills,
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
