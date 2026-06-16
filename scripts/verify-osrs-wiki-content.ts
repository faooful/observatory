import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseWikiQuestDetails } from "../lib/osrs/wikiQuestDetails";

const OSRS_WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT = "The Observatory wiki content verifier (local development)";
const QUEST_FIXTURES = ["A Kingdom Divided", "Dragon Slayer I", "Waterfall Quest"];

type GearBoss = {
  id: string;
  title: string;
  setups?: Array<{
    tier: string;
    style?: string;
    items?: Array<{ slot?: string; item?: string; wikiTitle?: string; icon?: string }>;
  }>;
};

type WikiBoss = {
  id: string;
  title: string;
};

type MoneyMaker = {
  id: string;
  title: string;
  wiki: string;
  category: string;
  intensity: string;
  gpPerHour: number;
};

function hasWikiMarkup(value: string) {
  return /\{\{|\}\}|\[\[|\]\]|\|(?:name|image|qp|rewards)\s*=/i.test(value);
}

async function fetchWikiWikitext(title: string) {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "wikitext",
    format: "json",
    formatversion: "2"
  });
  const response = await fetch(`${OSRS_WIKI_API_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`OSRS Wiki parse API returned ${response.status} for ${title}`);
  }

  const payload = (await response.json()) as { parse?: { wikitext?: string } };
  return payload.parse?.wikitext ?? "";
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), filePath), "utf8")) as T;
}

async function verifyQuestFixtures() {
  const problems: string[] = [];
  const fixtureSummaries = [];

  for (const title of QUEST_FIXTURES) {
    const details = parseWikiQuestDetails(await fetchWikiWikitext(title));
    if (!details) {
      problems.push(`${title}: Quest details template did not parse`);
      continue;
    }
    if (!details.rewards.length) {
      problems.push(`${title}: no rewards parsed`);
    }
    if (details.rewards.some(hasWikiMarkup)) {
      problems.push(`${title}: rewards contain raw wiki markup`);
    }
    if (details.requirements.some((requirement) => /^Completion of the following quests:?$/i.test(requirement))) {
      problems.push(`${title}: grouped quest heading leaked into requirements`);
    }
    fixtureSummaries.push({
      title,
      rewards: details.rewards.length,
      requirements: details.requirements.length,
      startMap: Boolean(details.startMap)
    });
  }

  const sectionFallback = parseWikiQuestDetails(`{{Quest details|start=Test start|startmap=1,2|difficulty=Novice|length=Short}}
==Rewards==
* [[Coins]]
* {{QPS|1}}
`);
  if (!sectionFallback?.rewards.includes("Coins") || !sectionFallback.rewards.some((reward) => /quest points/i.test(reward))) {
    problems.push("Synthetic section rewards fallback did not parse clean rewards");
  }

  return { fixtureSummaries, problems };
}

function verifyGearData(gearBosses: GearBoss[], wikiBosses: WikiBoss[]) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const gearBossKeys = new Set(gearBosses.flatMap((boss) => [boss.id, boss.title.toLowerCase()]));

  for (const boss of gearBosses) {
    if (!boss.setups?.length) {
      problems.push(`${boss.title}: no gear setups`);
      continue;
    }

    for (const setup of boss.setups) {
      const slots = new Set<string>();
      for (const item of setup.items ?? []) {
        if (!item.slot || !item.item) {
          problems.push(`${boss.title} ${setup.style ?? ""} ${setup.tier}: empty slot or item`);
          continue;
        }
        if (slots.has(item.slot)) {
          problems.push(`${boss.title} ${setup.style ?? ""} ${setup.tier}: duplicate slot ${item.slot}`);
        }
        slots.add(item.slot);
        if (hasWikiMarkup(item.item)) {
          problems.push(`${boss.title} ${setup.style ?? ""} ${setup.tier}: item contains wiki markup (${item.item})`);
        }
        if (!item.wikiTitle || !item.icon) {
          problems.push(`${boss.title} ${setup.style ?? ""} ${setup.tier}: ${item.item} is missing wikiTitle or icon`);
        }
        if (item.icon && !/^https:\/\/oldschool\.runescape\.wiki\/w\/Special:Redirect\/file\//.test(item.icon)) {
          problems.push(`${boss.title} ${setup.style ?? ""} ${setup.tier}: ${item.item} has non-wiki icon ${item.icon}`);
        }
      }
    }
  }

  const missingGear = wikiBosses.filter((boss) => !gearBossKeys.has(boss.id) && !gearBossKeys.has(boss.title.toLowerCase()));
  if (missingGear.length) {
    warnings.push(`${missingGear.length} wiki bosses do not have parseable strategy gear: ${missingGear.slice(0, 12).map((boss) => boss.title).join(", ")}`);
  }

  if (gearBosses.length < 35) {
    problems.push(`Only ${gearBosses.length} boss strategy pages parsed; expected at least 35`);
  }

  return { problems, warnings };
}

function verifyMoneyMakers(moneyMakers: MoneyMaker[]) {
  const problems: string[] = [];
  const seen = new Set<string>();

  if (moneyMakers.length < 100) {
    problems.push(`Only ${moneyMakers.length} money makers parsed; expected the expanded Wiki table`);
  }

  for (const method of moneyMakers) {
    const key = `${method.title.toLowerCase()}|${method.wiki.toLowerCase()}`;
    if (seen.has(key)) {
      problems.push(`${method.title}: duplicate money-maker row`);
    }
    seen.add(key);

    if (!method.title || hasWikiMarkup(method.title) || /<[^>]+>/.test(method.title)) {
      problems.push(`${method.id}: suspicious title ${method.title}`);
    }
    if (!method.wiki.startsWith("https://oldschool.runescape.wiki/")) {
      problems.push(`${method.title}: non-wiki guide URL ${method.wiki}`);
    }
    if (!Number.isFinite(method.gpPerHour) || method.gpPerHour <= 0) {
      problems.push(`${method.title}: invalid GP/hr ${method.gpPerHour}`);
    }
    if (!method.category || !method.intensity) {
      problems.push(`${method.title}: missing category or intensity`);
    }
  }

  return problems;
}

async function main() {
  const [
    questResult,
    bossData,
    gearData,
    moneyMakerData
  ] = await Promise.all([
    verifyQuestFixtures(),
    readJson<{ bosses?: WikiBoss[] }>("data/activities/osrs-bosses.json"),
    readJson<{ bosses?: GearBoss[] }>("data/activities/osrs-boss-strategy-gear.json"),
    readJson<{ moneyMakers?: MoneyMaker[] }>("data/activities/osrs-money-makers.json")
  ]);

  const gearResult = verifyGearData(gearData.bosses ?? [], bossData.bosses ?? []);
  const moneyMakerProblems = verifyMoneyMakers(moneyMakerData.moneyMakers ?? []);
  const problems = [...questResult.problems, ...gearResult.problems, ...moneyMakerProblems];
  const warnings = gearResult.warnings;

  console.log(JSON.stringify({
    questFixtures: questResult.fixtureSummaries,
    bossGearEntries: gearData.bosses?.length ?? 0,
    moneyMakers: moneyMakerData.moneyMakers?.length ?? 0,
    warnings,
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
