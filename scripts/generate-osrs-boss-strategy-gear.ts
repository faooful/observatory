import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OSRS_WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const OUTPUT_PATH = path.join(process.cwd(), "data/activities/osrs-boss-strategy-gear.json");
const USER_AGENT = "The Observatory local data generator (https://oldschool.runescape.wiki/)";

const SLOT_ORDER = ["head", "cape", "neck", "ammo", "weapon", "body", "shield", "legs", "hands", "feet", "ring"] as const;
const TIER_LABELS = ["High", "Med", "Low"] as const;

const PREFERRED_STYLE_BY_BOSS: Record<string, string> = {
  "General Graardor": "Ranged (Solo)"
};

type GearSetup = {
  tier: "Low" | "Med" | "High";
  style: string;
  note: string;
  source: string;
  items: Array<{ slot: string; item: string }>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function append(readingKey: boolean, key: string, value: string, text: string): [string, string] {
  return readingKey ? [key + text, value] : [key, value + text];
}

function wikiUrl(title: string) {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

async function fetchWikitext(page: string) {
  const params = new URLSearchParams({
    action: "parse",
    page,
    prop: "wikitext",
    format: "json",
    formatversion: "2"
  });
  const response = await fetch(`${OSRS_WIKI_API_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT }
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { parse?: { wikitext?: string }; error?: { info?: string } };
  if (!payload.parse?.wikitext) {
    return null;
  }

  return payload.parse.wikitext;
}

function extractTemplates(text: string, name: string) {
  const templates: string[] = [];
  const needle = `{{${name}`;
  let index = 0;

  while ((index = text.indexOf(needle, index)) !== -1) {
    let depth = 0;
    let cursor = index;
    for (; cursor < text.length - 1; cursor += 1) {
      const pair = text.slice(cursor, cursor + 2);
      if (pair === "{{") {
        depth += 1;
        cursor += 1;
        continue;
      }
      if (pair === "}}") {
        depth -= 1;
        cursor += 1;
        if (depth === 0) {
          templates.push(text.slice(index, cursor + 1));
          break;
        }
      }
    }
    index = cursor + 1;
  }

  return templates;
}

function getTemplateFields(template: string) {
  const inner = template.replace(/^\{\{Recommended equipment\s*\|?/, "").replace(/\}\}$/, "");
  const fields: Record<string, string> = {};
  let key = "";
  let value = "";
  let readingKey = true;
  let depth = 0;

  const commit = () => {
    if (key.trim()) {
      fields[key.trim()] = value.trim();
    }
    key = "";
    value = "";
    readingKey = true;
  };

  for (let index = 0; index < inner.length; index += 1) {
    const pair = inner.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      [key, value] = append(readingKey, key, value, pair);
      index += 1;
      continue;
    }
    if (pair === "}}") {
      depth -= 1;
      [key, value] = append(readingKey, key, value, pair);
      index += 1;
      continue;
    }

    const char = inner[index];
    if (char === "|" && depth === 0) {
      commit();
      continue;
    }
    if (char === "=" && depth === 0 && readingKey) {
      readingKey = false;
      continue;
    }

    [key, value] = append(readingKey, key, value, char);
  }
  commit();

  return fields;
}

function extractPlinkItem(value: string) {
  const match = value.match(/\{\{\s*plink(?:p)?\s*\|([^|}]+)([^}]*)\}\}/i);
  if (!match) {
    return undefined;
  }

  const params = match[2] ?? "";
  const textOverride = params.match(/\|\s*txt\s*=\s*([^|}]+)/i)?.[1]?.trim();
  return (textOverride || match[1]).replace(/<[^>]+>/g, "").trim();
}

function getSlotRanks(fields: Record<string, string>, slot: string) {
  return Object.keys(fields)
    .map((key) => key.match(new RegExp(`^${slot}(\\d+)$`))?.[1])
    .filter((rank): rank is string => Boolean(rank))
    .map(Number)
    .sort((left, right) => left - right);
}

function chooseRankForTier(ranks: number[], tier: GearSetup["tier"]) {
  if (tier === "High") {
    return ranks[0];
  }
  if (tier === "Med") {
    return ranks[Math.floor((ranks.length - 1) / 2)];
  }
  return ranks[ranks.length - 1];
}

function setupFromTier(fields: Record<string, string>, tier: GearSetup["tier"], source: string): GearSetup {
  const style = fields.style || "Recommended";
  const items = SLOT_ORDER.flatMap((slot) => {
    const rank = chooseRankForTier(getSlotRanks(fields, slot), tier);
    const item = extractPlinkItem(fields[`${slot}${rank}`] ?? "");
    return item ? [{ slot, item }] : [];
  });

  return {
    tier,
    style,
    note: `${style} setup from the OSRS Wiki strategies page.`,
    source,
    items
  };
}

async function getBossCandidates() {
  const [wikiBossRaw, seedRaw] = await Promise.all([
    readFile(path.join(process.cwd(), "data/activities/osrs-bosses.json"), "utf8"),
    readFile(path.join(process.cwd(), "data/activities/osrs-activities.json"), "utf8")
  ]);
  const wikiBosses = (JSON.parse(wikiBossRaw) as { bosses?: Array<{ title: string }> }).bosses ?? [];
  const seedActivities = JSON.parse(seedRaw) as Array<{ title: string; type: string }>;
  const titles = new Set<string>();

  for (const boss of wikiBosses) {
    titles.add(boss.title);
  }
  for (const activity of seedActivities) {
    if (activity.type === "boss") {
      titles.add(activity.title);
    }
  }

  return [...titles].sort((left, right) => left.localeCompare(right)).map((title) => ({
    title,
    strategyPage: `${title}/Strategies`,
    preferredStyle: PREFERRED_STYLE_BY_BOSS[title]
  }));
}

function countSetupItems(setup: GearSetup) {
  return setup.items.length;
}

function compareStyle(left: Record<string, string>, right: Record<string, string>, preferredStyle?: string) {
  if (preferredStyle) {
    if (left.style === preferredStyle) {
      return -1;
    }
    if (right.style === preferredStyle) {
      return 1;
    }
  }

  const styleScore = (style = "") => {
    if (/ranged.*solo/i.test(style)) return 1;
    if (/melee.*solo/i.test(style)) return 2;
    if (/magic.*solo/i.test(style)) return 3;
    if (/ranged/i.test(style)) return 4;
    if (/melee/i.test(style)) return 5;
    if (/magic/i.test(style)) return 6;
    if (/tank/i.test(style)) return 7;
    return 9;
  };

  return styleScore(left.style) - styleScore(right.style) || String(left.style).localeCompare(String(right.style));
}

async function main() {
  const bosses = [];
  const bossCandidates = await getBossCandidates();
  const skipped: string[] = [];
  for (const boss of bossCandidates) {
    const wikitext = await fetchWikitext(boss.strategyPage);
    if (!wikitext) {
      skipped.push(boss.title);
      continue;
    }

    const templates = extractTemplates(wikitext, "Recommended equipment")
      .map(getTemplateFields)
      .filter((template) => template.style)
      .sort((left, right) => compareStyle(left, right, boss.preferredStyle));
    if (!templates.length) {
      skipped.push(boss.title);
      continue;
    }

    const source = wikiUrl(boss.strategyPage);
    const setups = templates
      .flatMap((template) => TIER_LABELS.map((tier) => setupFromTier(template, tier, source)))
      .filter((setup) => countSetupItems(setup) >= 4);
    if (!setups.length) {
      skipped.push(boss.title);
      continue;
    }

    bosses.push({
      id: slugify(boss.title),
      title: boss.title,
      source,
      preferredStyle: boss.preferredStyle,
      setups
    });
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(
      {
        source: "https://oldschool.runescape.wiki/",
        generatedAt: new Date().toISOString(),
        bosses
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${bosses.length} boss strategy gear entries to ${OUTPUT_PATH}`);
  console.log(`Skipped ${skipped.length} bosses without parseable strategy equipment.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
