import { cleanWikiText, extractTemplate, parseTemplateFields, uniqueCaseInsensitive } from "./wikiParsing";

export type WikiQuestDetails = {
  start?: string;
  startMap?: {
    x: number;
    y: number;
    plane?: number;
  };
  difficulty?: string;
  length?: string;
  requirements: string[];
  items: string[];
  recommended: string[];
  rewards: string[];
  detailSource: "osrs-wiki-quest-details";
};

function parseListField(value?: string) {
  if (!value || /^none$/i.test(cleanWikiText(value))) {
    return [];
  }

  return uniqueCaseInsensitive(value
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^\*+\s*/, ""))
    .map(cleanWikiText)
    .filter(Boolean));
}

function parseQuestRequirements(value?: string) {
  const rawLines = parseListField(value);
  const requirements: string[] = [];
  let inQuestGroup = false;

  for (const line of rawLines) {
    if (/^Completion of the following quests:?$/i.test(line)) {
      inQuestGroup = true;
      continue;
    }

    if (/^The above quests all require/i.test(line)) {
      inQuestGroup = true;
      continue;
    }

    const looksLikeSkillRequirement = /\b\d{1,3}\s+(Attack|Defence|Strength|Hitpoints|Ranged|Prayer|Magic|Cooking|Woodcutting|Fletching|Fishing|Firemaking|Crafting|Smithing|Mining|Herblore|Agility|Thieving|Slayer|Farming|Runecraft|Hunter|Construction|Sailing)\b/i.test(line);
    if (looksLikeSkillRequirement) {
      inQuestGroup = false;
    }
    if (inQuestGroup && !looksLikeSkillRequirement && !/^Completion of\s+/i.test(line)) {
      requirements.push(`Completion of ${line}`);
      continue;
    }

    requirements.push(line);
  }

  return uniqueCaseInsensitive(requirements);
}

function parseQuestRewards(value?: string) {
  if (!value) {
    return [];
  }

  const rewardTemplate = extractTemplate(value, "Quest rewards");
  if (rewardTemplate) {
    const rewardFields = parseTemplateFields(rewardTemplate);
    const rewards = parseListField(rewardFields.get("rewards") ?? rewardFields.get("reward"));
    if (rewards.length) {
      return rewards;
    }
  }

  return parseListField(value)
    .filter((reward) => !/^\{\{Quest rewards$/i.test(reward))
    .filter((reward) => !/^\|?(name|image|qp|quest points|rewards)\s*=/i.test(reward))
    .filter((reward) => reward !== "}}" && !/^\}\}$/i.test(reward));
}

function extractHeadingSection(wikitext: string, headingNames: string[]) {
  const escapedNames = headingNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const headingPattern = new RegExp(`^==+\\s*(?:${escapedNames.join("|")})\\s*==+\\s*$`, "im");
  const match = headingPattern.exec(wikitext);
  if (!match || match.index === undefined) {
    return undefined;
  }

  const sectionStart = match.index + match[0].length;
  const sectionText = wikitext.slice(sectionStart);
  const nextHeadingIndex = sectionText.search(/^==[^=][\s\S]*?==\s*$/m);

  return (nextHeadingIndex === -1 ? sectionText : sectionText.slice(0, nextHeadingIndex)).trim();
}

function parseStartMap(value?: string) {
  if (!value) {
    return undefined;
  }

  const [x, y, plane] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return {
    x,
    y,
    ...(Number.isFinite(plane) ? { plane } : {})
  };
}

export function parseWikiQuestDetails(wikitext: string): WikiQuestDetails | null {
  const template = extractTemplate(wikitext, "Quest details");
  if (!template) {
    return null;
  }

  const fields = parseTemplateFields(template);
  const templateRewards = parseQuestRewards(fields.get("rewards") ?? fields.get("reward"));
  const sectionRewards = parseQuestRewards(extractHeadingSection(wikitext, ["Reward", "Rewards"]));

  return {
    start: cleanWikiText(fields.get("start") ?? ""),
    startMap: parseStartMap(fields.get("startmap")),
    difficulty: cleanWikiText(fields.get("difficulty") ?? ""),
    length: cleanWikiText(fields.get("length") ?? ""),
    requirements: parseQuestRequirements(fields.get("requirements")),
    items: parseListField(fields.get("items")),
    recommended: parseListField(fields.get("recommended")),
    rewards: templateRewards.length ? templateRewards : sectionRewards,
    detailSource: "osrs-wiki-quest-details"
  };
}
