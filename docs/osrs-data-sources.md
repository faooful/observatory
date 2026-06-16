# OSRS data sources

The Observatory should prefer public OSRS Wiki and open-source project data over local hand-authored data. Local JSON should act as a cache, curation layer, or coordinate fallback when a source does not expose a clean app-ready field.

## Current sources

| Source | Used for | Registry key |
| --- | --- | --- |
| Official OSRS Hiscores | Skill levels, Sailing, boss killcounts, clue/minigame/activity scores, and total level | `hiscores` |
| WikiSync | Player-shared quest completion | `wikisync` |
| OSRS Wiki MediaWiki API | Quest summaries and page links | `osrs-wiki` |
| Wise Old Man | Structured hiscore snapshots, combat level, bosses, activities, efficiency, achievements | `wise-old-man` |
| TempleOSRS | Tracked player stats, EHP/EHB, group data, and RuneLite-synced collection log summaries | `temple-osrs` |
| collectionlog.net | RuneLite-uploaded collection log pages and item history when reachable | `collectionlog-net` |
| RuneProfile | Opt-in RuneLite profile sync for richer private account state | `runeprofile` |
| Explv's Map | Coordinate inspection links | `explv` |
| Explv OSRS map tiles | Map tile generation reference | `osrs-map-tiles` |
| Dax Web Walker | Future route/pathing candidate | `dax-walker` |

The canonical in-app registry is `lib/osrs/sources.ts`. API responses should return source links from that registry instead of hardcoded display strings.

## UI asset provenance

The Observatory UI should use original CSS-generated parchment, stone, and bronze textures for interface chrome rather than copying OSRS client textures in bulk. Existing local OSRS icons and wiki-hosted item or skill icons may still be referenced where already used by the app, but those remain subject to their source-specific licensing and fan-content rules.

## Account intelligence source strategy

The account lookup should be layered from most public/reliable to most opt-in/private:

| Priority | Source | Account data available | Integration status |
| --- | --- | --- | --- |
| 1 | Official OSRS Hiscores | Skills, total level, Sailing, ranked minigames, clues, boss killcounts exposed by official hiscores | Required; parsed directly for skills, activities, clues, and bosses. Fetched uncached on each account lookup. |
| 2 | WikiSync | Quest completion state shared by the player through RuneLite | Required when available; currently used to hide completed quests and create incomplete quest markers. |
| 3 | Wise Old Man | Combat level, account type/build, bosses, activities, EHP/EHB/TTM, achievements, records, gains, snapshots | Active enrichment; `/api/player` calls `POST /players/:username` on account lookup to track/update the player, then uses the returned latest snapshot. If the update call fails, it falls back to a direct player read when possible. |
| 4 | TempleOSRS | Player stats, EHP/EHB, collection log summary, synced collection items/categories, group collection log data | Plugin-backed enrichment; `/api/player` fetches collection-log totals uncached when synced data exists. Temple collection-log freshness depends on the player's RuneLite/plugin sync. |
| 5 | collectionlog.net | Full uploaded collection log, item pages, recent obtained items, collection log hiscores | Optional full-log enrichment; `/api/player` tries it first for collection-log data and falls back to TempleOSRS when unavailable or unsynced. Reads are uncached, but profile freshness depends on the player's uploader/plugin sync. DNS for `api.collectionlog.net` failed from the current local environment during audit, so source status should be surfaced rather than treated as an account lookup failure. |
| 6 | RuneProfile | Skills, quests, collection log, and other in-client state via RuneLite plugin | Candidate opt-in profile source. Needs API/terms validation before app integration. |

### Current `/api/player` enrichment

The player response now includes optional fields that recommendation code can consume without breaking when sources are missing:

- `combatLevel` and `accountType` from Wise Old Man.
- `bosses` as keyed boss killcount snapshots from official hiscores, enriched by Wise Old Man when needed.
- `activities` as keyed activity/clue/minigame score snapshots from official hiscores, enriched by Wise Old Man when needed.
- `efficiency` with `ehp`, `ehb`, and `ttm` from Wise Old Man.
- `collectionLog` summary from collectionlog.net when reachable, otherwise TempleOSRS, including obtained/available slots, category/page totals, recent or sampled items, and available sync metadata.
- `sourceStatuses` so UI and diagnostics can explain which optional sources were available.

These sources are best-effort. Hiscores and WikiSync failures should still be handled as today; optional enrichment failures should never prevent an account lookup.

Account searches should favor freshness over server caching. Official hiscores, WikiSync, Wise Old Man, TempleOSRS, and collectionlog.net player reads are uncached in `/api/player`; Wise Old Man is explicitly updated before recommendations are generated. Quest metadata from the OSRS Wiki can remain cached because it is content metadata rather than player state.

## Data gaps and next sources to evaluate

- Achievement diaries: no confirmed public per-account diary completion API was found. Do not show account-specific diary recommendations from local seeds; keep diary recommendations source-gated until an opt-in RuneLite/manual source can provide real completion state.
- Full collection log: TempleOSRS and collectionlog.net both depend on RuneLite/plugin sync. Temple is currently reachable and exposes summary plus item data; collectionlog.net has strong documentation but was unreachable from this environment during audit.
- Combat achievements and task completions: use Wise Old Man achievements/progress where it maps to hiscore-backed thresholds; otherwise this likely needs an opt-in plugin source.
- Inventory, bank, gear, unlock toggles, diary tasks, and granular account flags: not publicly available from Jagex hiscores. These require opt-in RuneLite sync, manual user input, or staying out of scope.

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
