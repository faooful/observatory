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
  detailSource: "osrs-wiki-quest-details";
};

function extractTemplate(wikitext: string, templateName: string) {
  const startToken = `{{${templateName}`;
  const start = wikitext.toLowerCase().indexOf(startToken.toLowerCase());
  if (start === -1) {
    return null;
  }

  let depth = 0;
  for (let index = start; index < wikitext.length - 1; index += 1) {
    const pair = wikitext.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
      continue;
    }

    if (pair === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        return wikitext.slice(start + startToken.length, index - 1);
      }
    }
  }

  return null;
}

function splitTopLevel(value: string, separator: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pair === "{{" || pair === "[[") {
      depth += 1;
      current += pair;
      index += 1;
      continue;
    }

    if (pair === "}}" || pair === "]]") {
      depth = Math.max(0, depth - 1);
      current += pair;
      index += 1;
      continue;
    }

    if (value[index] === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += value[index];
  }

  parts.push(current);
  return parts;
}

function parseTemplateFields(template: string) {
  const fields = new Map<string, string>();

  splitTopLevel(template, "|").forEach((part) => {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex === -1) {
      return;
    }

    const key = part.slice(0, equalsIndex).trim();
    const value = part.slice(equalsIndex + 1).trim();
    if (key) {
      fields.set(key, value);
    }
  });

  return fields;
}

function cleanWikiText(value: string) {
  return value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{SCP\|([^|{}]+)\|([^|{}]+)(?:\|[^{}]*)?\}\}/g, "$2 $1")
    .replace(/\{\{Skill clickpic\|([^|{}]+)(?:\|[^{}]*)?\}\}/g, "$1")
    .replace(/\{\{Fairycode\|([^|{}]+)\}\}/g, "$1")
    .replace(/\{\{Boostable\|[^{}]*\}\}/g, "boostable")
    .replace(/\{\{FloorNumber\|[^{}]*\}\}/g, "")
    .replace(/\{\{[^{}|]+\|([^{}]+)\}\}/g, "$1")
    .replace(/\{\{[^{}]+\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseListField(value?: string) {
  if (!value || /^none$/i.test(cleanWikiText(value))) {
    return [];
  }

  return value
    .split(/\n+/)
    .map((line) => line.replace(/^\*+\s*/, ""))
    .map(cleanWikiText)
    .filter(Boolean);
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

  return {
    start: cleanWikiText(fields.get("start") ?? ""),
    startMap: parseStartMap(fields.get("startmap")),
    difficulty: cleanWikiText(fields.get("difficulty") ?? ""),
    length: cleanWikiText(fields.get("length") ?? ""),
    requirements: parseListField(fields.get("requirements")),
    items: parseListField(fields.get("items")),
    recommended: parseListField(fields.get("recommended")),
    detailSource: "osrs-wiki-quest-details"
  };
}
