import pins from "../data/activities/osrs-pins.json";
import { OSRS_SOURCES } from "../lib/osrs/sources";
import { parseWikiQuestDetails } from "../lib/osrs/wikiQuestDetails";
import type { ActivityPin } from "../lib/terrain/types";

const OSRS_WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT = "The Observatory marker verifier (local development)";
const DYNAMIC_MARKER_PROBES = ["Dragon Slayer I", "Priest in Peril", "Waterfall Quest"];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

function getWikiTitle(pin: ActivityPin) {
  if (pin.wikiUrl) {
    return decodeURIComponent(pin.wikiUrl.split("/").pop() ?? pin.questName ?? pin.label).replace(/_/g, " ");
  }

  return pin.questName ?? pin.label;
}

function hasExplvCoordinates(pin: ActivityPin) {
  return Number.isFinite(pin.x) && Number.isFinite(pin.y) && Number.isFinite(pin.plane ?? 0);
}

async function fetchWikiPages(titles: string[]) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    redirects: "1",
    prop: "info",
    inprop: "url",
    titles: titles.join("|"),
    origin: "*"
  });
  const response = await fetch(`${OSRS_WIKI_API_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`OSRS Wiki API returned ${response.status}`);
  }

  return (await response.json()) as {
    query?: {
      pages?: Record<string, { missing?: boolean; title?: string; fullurl?: string }>;
    };
  };
}

async function fetchWikiWikitext(title: string) {
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
    }
  });

  if (!response.ok) {
    throw new Error(`OSRS Wiki parse API returned ${response.status} for ${title}`);
  }

  const payload = (await response.json()) as {
    parse?: {
      wikitext?: {
        "*": string;
      };
    };
  };

  return payload.parse?.wikitext?.["*"] ?? "";
}

async function main() {
  const questPins = (pins as ActivityPin[]).filter((pin) => pin.type === "quest" && pin.questName);
  const sourceUrls = Object.values(OSRS_SOURCES).map((source) => source.url);
  const titles = questPins.map(getWikiTitle);
  const payload = await fetchWikiPages(titles);
  const pages = Object.values(payload.query?.pages ?? {});
  const pagesByTitle = new Map(pages.map((page) => [normalize(page.title ?? ""), page]));
  const detailEntries = await Promise.all(
    questPins.map(async (pin) => {
      const title = getWikiTitle(pin);
      return [pin.id, parseWikiQuestDetails(await fetchWikiWikitext(title))] as const;
    })
  );
  const dynamicProbeEntries = await Promise.all(
    DYNAMIC_MARKER_PROBES.map(async (title) => [title, parseWikiQuestDetails(await fetchWikiWikitext(title))] as const)
  );
  const detailCount = detailEntries.filter(([, details]) => details !== null).length;
  const startMapCount = detailEntries.filter(([, details]) => details?.startMap).length;
  const dynamicProbeStartMaps = dynamicProbeEntries.filter(([, details]) => details?.startMap).length;
  const problems: string[] = [];

  for (const pin of questPins) {
    const page = pagesByTitle.get(normalize(getWikiTitle(pin)));
    if (!page || page.missing) {
      problems.push(`${pin.id}: missing wiki page for ${getWikiTitle(pin)}`);
    }

    if (!pin.coordinateSource) {
      problems.push(`${pin.id}: missing coordinateSource provenance`);
    }

    if (!hasExplvCoordinates(pin)) {
      problems.push(`${pin.id}: missing coordinates for Explv map link`);
    }
  }

  dynamicProbeEntries.forEach(([title, details]) => {
    if (!details?.startMap) {
      problems.push(`${title}: dynamic OSRS Wiki marker probe did not expose startmap`);
    }
  });

  console.log(JSON.stringify({
    checked: questPins.length,
    wikiPagesFound: questPins.length - problems.filter((problem) => problem.includes("missing wiki page")).length,
    explvMapLinks: questPins.length - problems.filter((problem) => problem.includes("Explv map link")).length,
    wikiQuestDetailsParsed: detailCount,
    wikiStartMapsFound: startMapCount,
    dynamicWikiMarkerProbes: dynamicProbeEntries.length,
    dynamicWikiMarkerProbeStartMaps: dynamicProbeStartMaps,
    registeredSources: sourceUrls.length,
    problems
  }, null, 2));

  if (problems.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
