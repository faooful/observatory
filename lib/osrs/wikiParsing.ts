export function extractTemplate(wikitext: string, templateName: string, includeBraces = false) {
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
        return includeBraces ? wikitext.slice(start, index + 1) : wikitext.slice(start + startToken.length, index - 1);
      }
    }
  }

  return null;
}

export function extractTemplates(wikitext: string, templateName: string, includeBraces = false) {
  const templates: string[] = [];
  const startToken = `{{${templateName}`;
  let cursor = 0;

  while (cursor < wikitext.length) {
    const start = wikitext.toLowerCase().indexOf(startToken.toLowerCase(), cursor);
    if (start === -1) {
      break;
    }

    let depth = 0;
    let index = start;
    for (; index < wikitext.length - 1; index += 1) {
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
          templates.push(includeBraces ? wikitext.slice(start, index + 1) : wikitext.slice(start + startToken.length, index - 1));
          break;
        }
      }
    }

    cursor = index + 1;
  }

  return templates;
}

export function splitTopLevel(value: string, separator: string) {
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

export function parseTemplateFields(template: string) {
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

export function cleanWikiText(value: string) {
  return value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{SCP\|([^|{}]+)\|([^|{}]+)(?:\|[^{}]*)?\}\}/g, "$2 $1")
    .replace(/\{\{Skill clickpic\|([^|{}]+)(?:\|[^{}]*)?\}\}/g, "$1")
    .replace(/\{\{Fairycode\|([^|{}]+)\}\}/g, "$1")
    .replace(/\{\{Boostable\|[^{}]*\}\}/g, "boostable")
    .replace(/\{\{FloorNumber\|[^{}]*\}\}/g, "")
    .replace(/\{\{QPS\|([^|{}]+)\}\}/g, "$1 quest points")
    .replace(/\{\{plink(?:p)?\|([^|{}]+)(?:\|txt=([^|{}]+))?[^{}]*\}\}/gi, (_match, title: string, text?: string) => text ?? title)
    .replace(/\{\{[^{}|]+\|([^{}]+)\}\}/g, "$1")
    .replace(/\{\{[^{}]+\}\}/g, "")
    .replace(/\[\[File:[^\]]+\]\]/gi, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueCaseInsensitive(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function wikiPageUrl(title: string) {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export function wikiFileIcon(fileName: string) {
  return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}
