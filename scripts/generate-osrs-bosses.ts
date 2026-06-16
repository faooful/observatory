import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OSRS_WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const OUTPUT_PATH = path.join(process.cwd(), "data/activities/osrs-bosses.json");
const USER_AGENT = "The Observatory local data generator (https://oldschool.runescape.wiki/)";

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

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripWiki(value: string) {
  return decodeHtml(
    value
      .replace(/\{\{[^{}]*\}\}/g, " ")
      .replace(/\[\[File:[^\]]+\]\]/gi, " ")
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/'''?/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function wikiUrl(title: string) {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`OSRS Wiki request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function getBossTitles() {
  const titles: string[] = [];
  let cmcontinue: string | undefined;

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: "Category:Bosses",
      cmnamespace: "0",
      cmlimit: "500",
      format: "json",
      formatversion: "2"
    });
    if (cmcontinue) {
      params.set("cmcontinue", cmcontinue);
    }

    const payload = await fetchJson<{
      continue?: { cmcontinue?: string };
      query: { categorymembers: Array<{ title: string }> };
    }>(`${OSRS_WIKI_API_URL}?${params}`);

    titles.push(...payload.query.categorymembers.map((member) => member.title));
    cmcontinue = payload.continue?.cmcontinue;
  } while (cmcontinue);

  return titles.filter((title) => !["Boss", "Boss kill count"].includes(title));
}

async function getPageDetails(titles: string[]) {
  const pages: Array<{ title: string; fullurl: string; extract: string; wikitext: string }> = [];

  for (let index = 0; index < titles.length; index += 50) {
    const batch = titles.slice(index, index + 50);
    const params = new URLSearchParams({
      action: "query",
      titles: batch.join("|"),
      prop: "extracts|info|revisions",
      exintro: "1",
      explaintext: "1",
      inprop: "url",
      rvprop: "content",
      rvslots: "main",
      format: "json",
      formatversion: "2"
    });

    const payload = await fetchJson<{
      query: {
        pages: Array<{
          title: string;
          fullurl?: string;
          extract?: string;
          revisions?: Array<{ slots?: { main?: { content?: string } } }>;
        }>;
      };
    }>(`${OSRS_WIKI_API_URL}?${params}`);

    for (const page of payload.query.pages) {
      pages.push({
        title: page.title,
        fullurl: page.fullurl ?? wikiUrl(page.title),
        extract: page.extract ?? "",
        wikitext: page.revisions?.[0]?.slots?.main?.content ?? ""
      });
    }
  }

  return pages;
}

function getCombatLevel(wikitext: string) {
  const levels = [...wikitext.matchAll(/\|\s*combat\d*\s*=\s*([\d,]+)/gi)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((level) => Number.isFinite(level) && level > 0);

  return levels.length ? Math.max(...levels) : undefined;
}

function getQuest(wikitext: string, extract: string) {
  const questField = wikitext.match(/\|\s*quest\s*=\s*(.+)/i)?.[1];
  const questLink = questField?.match(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/)?.[1];
  if (questLink && !/no|none/i.test(questLink)) {
    return stripWiki(questLink);
  }

  const participationMatch = extract.match(/(?:complete|completed|completion of)\s+the\s+(.+?)\s+quest/i) ?? extract.match(/(?:complete|completed|completion of)\s+(.+?)\s+quest/i);
  if (participationMatch?.[1]) {
    return participationMatch[1].replace(/^the\s+/i, "").trim();
  }

  return undefined;
}

function getLocation(wikitext: string) {
  const locationField = wikitext.match(/\|\s*location\s*=\s*(.+)/i)?.[1];
  if (!locationField) {
    return undefined;
  }

  return stripWiki(locationField.split(/\n|\|/)[0]);
}

function getCoordinates(wikitext: string) {
  const mapMatch = wikitext.match(/\{\{\s*Map\s*\|([^}]+)\}\}/i);
  const locLineMatch = wikitext.match(/\{\{\s*LocLine\s*\|([^}]+)\}\}/i);
  const coordinateSource = mapMatch?.[1] ?? locLineMatch?.[1];
  if (!coordinateSource) {
    return undefined;
  }

  const x = Number(
    coordinateSource.match(/(?:^|\|)\s*x\s*=\s*(\d+)/i)?.[1] ?? coordinateSource.match(/(?:^|\|)\s*x\s*:\s*(\d+)/i)?.[1]
  );
  const y = Number(
    coordinateSource.match(/(?:^|\|)\s*y\s*=\s*(\d+)/i)?.[1] ?? coordinateSource.match(/(?:^|,)\s*y\s*:\s*(\d+)/i)?.[1]
  );
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return { x, y };
}

function getCategory(title: string, wikitext: string, extract: string) {
  const text = `${title} ${extract} ${wikitext}`.toLowerCase();
  const normalizedTitle = title.toLowerCase();
  if (/barrows|dharok|guthan|torag|verac|ahrim|karil/.test(normalizedTitle)) {
    return "Barrows";
  }
  if (/nex|general graardor|commander zilyana|kree'arra|k'ril tsutsaroth/.test(normalizedTitle)) {
    return "God Wars";
  }
  if (/abyssal sire|alchemical hydra|araxxor|cerberus|grotesque guardians|dusk|dawn|kraken|thermonuclear smoke devil/.test(normalizedTitle)) {
    return "Slayer";
  }
  if (/callisto|vet'ion|venenatis|artio|calvar'ion|spindel|chaos elemental|chaos fanatic|scorpia|king black dragon|crazy archaeologist|deranged archaeologist|revenant|wrathmaw/.test(normalizedTitle)) {
    return "Wilderness";
  }
  if (/\braid\b|\braids\b|tombs of amascut|chambers of xeric|theatre of blood/.test(text)) {
    return "Raid";
  }
  if (/wilderness|revenant|callisto|vet'ion|venenatis|artio|calvar'ion|spindel|chaos elemental|chaos fanatic|scorpia|king black dragon/.test(text)) {
    return "Wilderness";
  }
  if (/slayer|hydra|cerberus|sire|thermonuclear|kraken|gargoyle|arachnor/.test(text)) {
    return "Slayer";
  }
  if (/quest/.test(text)) {
    return "Quest";
  }

  return "Boss";
}

function getDifficulty(combatLevel: number | undefined, category: string) {
  if (category === "Raid") {
    return "Raid";
  }
  if (!combatLevel) {
    return "Unknown";
  }
  if (combatLevel >= 600) {
    return "Very high";
  }
  if (combatLevel >= 300) {
    return "High";
  }
  if (combatLevel >= 100) {
    return "Mid";
  }

  return "Low";
}

function getSummary(page: { title: string; extract: string }, category: string, combatLevel: number | undefined) {
  const firstSentence = page.extract.split(/\n|(?<=\.)\s+/).find((sentence) => sentence.trim().length > 20)?.trim();
  if (firstSentence) {
    return firstSentence.length > 170 ? `${firstSentence.slice(0, 167).trim()}...` : firstSentence;
  }

  return combatLevel ? `${category} encounter with combat level ${combatLevel}.` : `${category} encounter from the OSRS Wiki boss category.`;
}

function isLikelyBossPage(wikitext: string, extract: string) {
  return /Infobox (Monster|Activity|NPC)|\bboss\b|raid/i.test(`${wikitext.slice(0, 2500)} ${extract}`);
}

function isRepeatableMoneyBoss(page: { title: string; extract: string; wikitext: string }, category: string) {
  if (category === "Quest" || category === "Raid") {
    return false;
  }

  if (/^(black golem|elvarg|melzar the mad|bouncer \(ghost\)|gemstone crab|demonic brutus|shellbane gryphon|tztok-jad|tzkal-zuk|wrathmaw)$/i.test(page.title)) {
    return false;
  }

  const text = `${page.extract} ${page.wikitext}`.toLowerCase();
  if (/\[\[category:quest monsters\]\]|the quest boss|encountered during .* quest|players have to kill .* quest|was a proposed/.test(text)) {
    return false;
  }

  if (/nightmare zone/.test(page.title.toLowerCase())) {
    return false;
  }

  return /hasstrategy|dropstable|dropsline|slayxp|assignedby|\[\[category:bosses\]\]|\bboss\b/i.test(page.wikitext);
}

function toBoss(page: { title: string; fullurl: string; extract: string; wikitext: string }): WikiBoss | null {
  if (!isLikelyBossPage(page.wikitext, page.extract)) {
    return null;
  }

  const combatLevel = getCombatLevel(page.wikitext);
  const category = getCategory(page.title, page.wikitext.split(/==\s*Changes\s*==/i)[0].slice(0, 1800), page.extract);
  const difficulty = getDifficulty(combatLevel, category);
  if (!isRepeatableMoneyBoss(page, category)) {
    return null;
  }

  return {
    id: `wiki-boss-${slugify(page.title)}`,
    title: page.title,
    wiki: page.fullurl,
    summary: getSummary(page, category, combatLevel),
    category,
    difficulty,
    combatLevel,
    quest: category === "Barrows" ? undefined : getQuest(page.wikitext, page.extract),
    locationName: getLocation(page.wikitext) ?? "Boss entrance",
    coordinates: getCoordinates(page.wikitext)
  };
}

async function main() {
  const titles = await getBossTitles();
  const pages = await getPageDetails(titles);
  const bosses = pages
    .map(toBoss)
    .filter((boss): boss is WikiBoss => Boolean(boss))
    .sort((left, right) => {
      const difficultyScore = (boss: WikiBoss) =>
        boss.difficulty === "Raid" ? 5 : boss.difficulty === "Very high" ? 4 : boss.difficulty === "High" ? 3 : boss.difficulty === "Mid" ? 2 : boss.difficulty === "Low" ? 1 : 0;
      return difficultyScore(right) - difficultyScore(left) || (right.combatLevel ?? 0) - (left.combatLevel ?? 0) || left.title.localeCompare(right.title);
    });

  if (bosses.length < 50) {
    throw new Error(`Parsed only ${bosses.length} bosses; expected the OSRS Wiki boss category to produce a broad list.`);
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(
      {
        source: "https://oldschool.runescape.wiki/w/Category:Bosses",
        generatedAt: new Date().toISOString(),
        bosses
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${bosses.length} OSRS Wiki bosses to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
