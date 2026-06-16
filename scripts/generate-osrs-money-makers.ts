import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OSRS_WIKI_PARSE_URL =
  "https://oldschool.runescape.wiki/api.php?action=parse&page=Money_making_guide&prop=text&format=json&formatversion=2";

const OUTPUT_PATH = path.join(process.cwd(), "data/activities/osrs-money-makers.json");

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

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8226;/g, "•")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCells(rowHtml: string) {
  return [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({
    attrs: match[1],
    html: match[2]
  }));
}

function parseRequirements(skillsHtml: string): WikiMoneyMaker["requirements"] {
  const requirements = [...skillsHtml.matchAll(/<span\b([^>]*\bclass="scp"[^>]*)>/gi)]
    .map((match) => {
      const attrs = match[1];
      const skill = decodeHtml(attrs.match(/\bdata-skill="([^"]+)"/i)?.[1] ?? "");
      const level = Number((attrs.match(/\bdata-level="([^"]+)"/i)?.[1] ?? "").match(/\d+/)?.[0]);

      if (!skill || !Number.isFinite(level) || level <= 0) {
        return null;
      }

      return {
        label: `${level} ${skill}`,
        skill,
        level
      };
    })
    .filter((requirement): requirement is WikiMoneyMaker["requirements"][number] => Boolean(requirement));

  const bySkill = new Map<string, WikiMoneyMaker["requirements"][number]>();
  for (const requirement of requirements) {
    const existing = bySkill.get(requirement.skill);
    if (!existing || requirement.level > existing.level) {
      bySkill.set(requirement.skill, requirement);
    }
  }

  return [...bySkill.values()];
}

function parseRows(html: string) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const moneyMakers: WikiMoneyMaker[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.includes("Money_making_guide/")) {
      continue;
    }

    const cells = getCells(row);
    if (cells.length < 6) {
      continue;
    }

    const linkMatch = cells[0].html.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const isRecurringRow = cells.length >= 8 && /^\d{2}:\d{2}:\d{2}$/.test(stripTags(cells[2].html)) && /^\d{2}:\d{2}:\d{2}$/.test(stripTags(cells[4].html));
    const profitCell = isRecurringRow ? cells[3] : cells[1];
    const skillsCell = isRecurringRow ? cells[5] : cells[2];
    const categoryCell = isRecurringRow ? cells[6] : cells[3];
    const intensityCell = isRecurringRow ? undefined : cells[4];
    const membersCell = isRecurringRow ? cells[7] : cells[5];
    const profitMatch = profitCell.attrs.match(/data-sort-value="([^"]+)"/i) ?? profitCell.html.match(/data-sort-value="([^"]+)"/i);
    if (!linkMatch || !profitMatch) {
      continue;
    }

    const title = stripTags(linkMatch[2]);
    const href = decodeHtml(linkMatch[1]);
    const gpPerHour = Math.round(Number(profitMatch[1]));
    if (!title || !Number.isFinite(gpPerHour) || gpPerHour <= 0) {
      continue;
    }

    const wikiPath = href.startsWith("http") ? href : `https://oldschool.runescape.wiki${href}`;
    const key = `${title.toLowerCase()}|${wikiPath.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    moneyMakers.push({
      id: `wiki-money-${slugify(title)}`,
      title,
      wiki: wikiPath,
      category: stripTags(categoryCell.html) || "Money making",
      intensity: isRecurringRow ? "Recurring" : stripTags(intensityCell?.html ?? "") || "Unknown",
      members: /Members/i.test(membersCell.html),
      gpPerHour,
      requirements: parseRequirements(skillsCell.html)
    });
  }

  return moneyMakers.sort((left, right) => right.gpPerHour - left.gpPerHour || left.title.localeCompare(right.title));
}

async function main() {
  const response = await fetch(OSRS_WIKI_PARSE_URL, {
    headers: {
      "User-Agent": "The Observatory local data generator (https://oldschool.runescape.wiki/)"
    }
  });

  if (!response.ok) {
    throw new Error(`OSRS Wiki request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as { parse?: { text?: string } };
  const html = payload.parse?.text ?? "";
  const moneyMakers = parseRows(html);

  if (moneyMakers.length < 100) {
    throw new Error(`Parsed only ${moneyMakers.length} money makers; expected the expanded Wiki table.`);
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(
      {
        source: "https://oldschool.runescape.wiki/w/Money_making_guide",
        generatedAt: new Date().toISOString(),
        moneyMakers
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${moneyMakers.length} OSRS Wiki money makers to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
