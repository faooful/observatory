export const OSRS_SOURCES = {
  hiscores: {
    id: "hiscores",
    label: "Official OSRS Hiscores",
    url: "https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws",
    role: "Skill levels and account totals"
  },
  wikisync: {
    id: "wikisync",
    label: "WikiSync",
    url: "https://github.com/weirdgloop/wikisync-api",
    role: "Quest completion state shared by the player"
  },
  osrsWiki: {
    id: "osrs-wiki",
    label: "OSRS Wiki",
    url: "https://oldschool.runescape.wiki/api.php",
    role: "Quest summaries and wiki page links"
  },
  explv: {
    id: "explv",
    label: "Explv's Map",
    url: "https://github.com/Explv/Explv.github.io",
    role: "Open-source coordinate map links"
  },
  osrsMapTiles: {
    id: "osrs-map-tiles",
    label: "Explv OSRS map tiles",
    url: "https://github.com/Explv/osrs_map_tiles",
    role: "Open-source map tile generation reference"
  },
  daxWalker: {
    id: "dax-walker",
    label: "Dax Web Walker",
    url: "https://github.com/itsdax/Runescape-Web-Walker-Engine",
    role: "Future route/pathing candidate"
  }
} as const;

export type OsrsSourceId = typeof OSRS_SOURCES[keyof typeof OSRS_SOURCES]["id"];

export type OsrsSourceLink = {
  id: OsrsSourceId;
  label: string;
  url: string;
  role: string;
};

export function getSourceLink(source: keyof typeof OSRS_SOURCES): OsrsSourceLink {
  return OSRS_SOURCES[source];
}

export function getSourceLinks(sources: Array<keyof typeof OSRS_SOURCES>): OsrsSourceLink[] {
  return sources.map(getSourceLink);
}
