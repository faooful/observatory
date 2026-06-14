# OSRS data sources

The Observatory should prefer public OSRS Wiki and open-source project data over local hand-authored data. Local JSON should act as a cache, curation layer, or coordinate fallback when a source does not expose a clean app-ready field.

## Current sources

| Source | Used for | Registry key |
| --- | --- | --- |
| Official OSRS Hiscores | Skill levels and total level | `hiscores` |
| WikiSync | Player-shared quest completion | `wikisync` |
| OSRS Wiki MediaWiki API | Quest summaries and page links | `osrs-wiki` |
| Explv's Map | Coordinate inspection links | `explv` |
| Explv OSRS map tiles | Map tile generation reference | `osrs-map-tiles` |
| Dax Web Walker | Future route/pathing candidate | `dax-walker` |

The canonical in-app registry is `lib/osrs/sources.ts`. API responses should return source links from that registry instead of hardcoded display strings.

## Marker rules

- Do not render quest markers before an account lookup.
- Use WikiSync quest completion to decide which quest markers are relevant.
- Hide completed quests by default.
- Pull quest summary text and canonical wiki URLs from the OSRS Wiki API.
- Pull quest start text, start map coordinate, difficulty, length, requirements, items, and recommended gear/travel from the OSRS Wiki `Quest details` template when available.
- Prefer OSRS Wiki `startmap` coordinates for rendered quest markers.
- Keep local quest coordinates only as explicit fallback data when a wiki `startmap` is unavailable or not parseable.
- Do not require a quest to exist in `data/activities/osrs-pins.json`; WikiSync plus OSRS Wiki page data should be enough to create a marker when `startmap` exists.
- Include an Explv map URL for every rendered marker so coordinates can be inspected externally.

## Verification

Run:

```bash
npm run verify:markers
```

The verifier checks that every local quest marker has:

- a resolvable OSRS Wiki page
- coordinate provenance
- enough coordinates to generate an Explv map link

It also probes several quests that are not in the local marker file to confirm OSRS Wiki `Quest details` start maps can produce dynamic markers without local coordinates.

Run `npm run build` after changing API payloads or source metadata.
