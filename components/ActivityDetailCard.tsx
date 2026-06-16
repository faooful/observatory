"use client";

import { useMemo, useState } from "react";
import type { Activity } from "@/lib/activities/types";
import { MetricPill } from "./MetricPill";
import { RequirementList } from "./RequirementList";
import { RewardList } from "./RewardList";
import { RouteSteps } from "./RouteSteps";

const DPS_TOOL_URL = "https://tools.runescape.wiki/osrs-dps/";
const FALLBACK_ICONS: Record<string, string> = {
  quest: "/osrs-icons/quest-start.png",
  money: "/osrs-icons/coins-10000.png",
  boss: "/osrs-icons/combat.png",
  clue: "/osrs-icons/collection-log.png"
};

type GearSlot = {
  slot: string;
  item: string;
};

type GearSetup = {
  tier: "Low" | "Med" | "High";
  style?: string;
  note: string;
  source?: string;
  items: GearSlot[];
};

const SLOT_ORDER = ["head", "cape", "neck", "ammo", "weapon", "body", "shield", "legs", "hands", "feet", "ring"];
const SLOT_LABELS: Record<string, string> = {
  head: "Head",
  cape: "Cape",
  neck: "Neck",
  ammo: "Ammo",
  weapon: "Weapon",
  body: "Body",
  shield: "Off-hand",
  legs: "Legs",
  hands: "Hands",
  feet: "Feet",
  ring: "Ring"
};

function wikiFileIcon(fileName: string) {
  return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

function itemIcon(item: string) {
  return wikiFileIcon(`${item}.png`);
}

function itemWikiUrl(item: string) {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(item.replace(/ /g, "_"))}`;
}

function formatLogItem(item: { id: number; count?: number; name?: string }) {
  const label = item.name ?? `Item #${item.id}`;
  return item.count && item.count > 1 ? `${label} x${item.count.toLocaleString()}` : label;
}

function isWildernessBoss(activity: Activity) {
  return activity.boss?.category === "Wilderness" || /wilderness|revenant|callisto|vet'ion|venenatis|artio|calvar|spindel/i.test(activity.title);
}

function getBossStyle(activity: Activity) {
  const title = activity.title.toLowerCase();
  if (/zulrah|kraken|whisperer|zalcano|barrows|rex/.test(title)) {
    return "magic";
  }
  if (/muspah|vorkath|kree|jad|zuk|leviathan|venenatis|spindel|araxxor/.test(title)) {
    return "ranged";
  }
  return "melee";
}

function getGearSetups(activity: Activity): GearSetup[] {
  if (activity.gearSetups?.length) {
    return activity.gearSetups;
  }

  const style = getBossStyle(activity);
  const wilderness = isWildernessBoss(activity);

  if (wilderness) {
    return [
      {
        tier: "Low",
        note: "Cheap risk, protect item friendly.",
        items: [
          { slot: "head", item: "Helm of neitiznot" },
          { slot: "cape", item: "Ardougne cloak 3" },
          { slot: "neck", item: "Amulet of glory" },
          { slot: "weapon", item: "Dragon mace" },
          { slot: "body", item: "Proselyte hauberk" },
          { slot: "shield", item: "Dragon defender" },
          { slot: "legs", item: "Proselyte cuisse" },
          { slot: "hands", item: "Barrows gloves" },
          { slot: "feet", item: "Climbing boots" },
          { slot: "ring", item: "Ring of wealth" }
        ]
      },
      {
        tier: "Med",
        note: "Better kills while keeping risk controlled.",
        items: [
          { slot: "head", item: "Helm of neitiznot" },
          { slot: "cape", item: "Mythical cape" },
          { slot: "neck", item: "Amulet of torture" },
          { slot: "weapon", item: "Ursine chainmace" },
          { slot: "body", item: "Fighter torso" },
          { slot: "shield", item: "Dragon defender" },
          { slot: "legs", item: "Torag's platelegs" },
          { slot: "hands", item: "Barrows gloves" },
          { slot: "feet", item: "Dragon boots" },
          { slot: "ring", item: "Berserker ring" }
        ]
      },
      {
        tier: "High",
        note: "High output; check your protected items.",
        items: [
          { slot: "head", item: "Serpentine helm" },
          { slot: "cape", item: "Infernal cape" },
          { slot: "neck", item: "Amulet of rancour" },
          { slot: "weapon", item: "Ursine chainmace" },
          { slot: "body", item: "Torva platebody" },
          { slot: "shield", item: "Avernic defender" },
          { slot: "legs", item: "Torva platelegs" },
          { slot: "hands", item: "Ferocious gloves" },
          { slot: "feet", item: "Primordial boots" },
          { slot: "ring", item: "Ultor ring" }
        ]
      }
    ];
  }

  if (style === "ranged") {
    return [
      {
        tier: "Low",
        note: "Accessible ranged setup.",
        items: [
          { slot: "head", item: "Blessed coif" },
          { slot: "cape", item: "Ava's accumulator" },
          { slot: "neck", item: "Amulet of glory" },
          { slot: "ammo", item: "Amethyst broad bolts" },
          { slot: "weapon", item: "Rune crossbow" },
          { slot: "body", item: "Black d'hide body" },
          { slot: "shield", item: "Book of law" },
          { slot: "legs", item: "Black d'hide chaps" },
          { slot: "hands", item: "Barrows gloves" },
          { slot: "feet", item: "Blessed boots" },
          { slot: "ring", item: "Archers ring" }
        ]
      },
      {
        tier: "Med",
        note: "Stronger accuracy and damage.",
        items: [
          { slot: "head", item: "Crystal helm" },
          { slot: "cape", item: "Ava's assembler" },
          { slot: "neck", item: "Necklace of anguish" },
          { slot: "weapon", item: "Bow of faerdhinen" },
          { slot: "body", item: "Crystal body" },
          { slot: "legs", item: "Crystal legs" },
          { slot: "hands", item: "Barrows gloves" },
          { slot: "feet", item: "Pegasian boots" },
          { slot: "ring", item: "Lightbearer" }
        ]
      },
      {
        tier: "High",
        note: "DPS-focused ranged setup.",
        items: [
          { slot: "head", item: "Masori mask (f)" },
          { slot: "cape", item: "Dizana's quiver" },
          { slot: "neck", item: "Necklace of anguish" },
          { slot: "ammo", item: "Dragon arrow" },
          { slot: "weapon", item: "Twisted bow" },
          { slot: "body", item: "Masori body (f)" },
          { slot: "legs", item: "Masori chaps (f)" },
          { slot: "hands", item: "Zaryte vambraces" },
          { slot: "feet", item: "Pegasian boots" },
          { slot: "ring", item: "Venator ring" }
        ]
      }
    ];
  }

  if (style === "magic") {
    return [
      {
        tier: "Low",
        note: "Cheap magic setup.",
        items: [
          { slot: "head", item: "Mystic hat" },
          { slot: "cape", item: "God cape" },
          { slot: "neck", item: "Amulet of glory" },
          { slot: "weapon", item: "Trident of the seas" },
          { slot: "body", item: "Mystic robe top" },
          { slot: "shield", item: "Book of darkness" },
          { slot: "legs", item: "Mystic robe bottom" },
          { slot: "hands", item: "Barrows gloves" },
          { slot: "feet", item: "Mystic boots" },
          { slot: "ring", item: "Seers ring" }
        ]
      },
      {
        tier: "Med",
        note: "Good magic damage for most bosses.",
        items: [
          { slot: "head", item: "Ahrim's hood" },
          { slot: "cape", item: "Imbued saradomin cape" },
          { slot: "neck", item: "Occult necklace" },
          { slot: "weapon", item: "Trident of the swamp" },
          { slot: "body", item: "Ahrim's robetop" },
          { slot: "shield", item: "Elidinis' ward" },
          { slot: "legs", item: "Ahrim's robeskirt" },
          { slot: "hands", item: "Tormented bracelet" },
          { slot: "feet", item: "Eternal boots" },
          { slot: "ring", item: "Seers ring (i)" }
        ]
      },
      {
        tier: "High",
        note: "High-end magic damage.",
        items: [
          { slot: "head", item: "Ancestral hat" },
          { slot: "cape", item: "Imbued god cape" },
          { slot: "neck", item: "Occult necklace" },
          { slot: "weapon", item: "Tumeken's shadow" },
          { slot: "body", item: "Ancestral robe top" },
          { slot: "shield", item: "Elidinis' ward (f)" },
          { slot: "legs", item: "Ancestral robe bottom" },
          { slot: "hands", item: "Tormented bracelet" },
          { slot: "feet", item: "Eternal boots" },
          { slot: "ring", item: "Magus ring" }
        ]
      }
    ];
  }

  return [
    {
      tier: "Low",
      note: "Budget melee baseline.",
      items: [
        { slot: "head", item: "Helm of neitiznot" },
        { slot: "cape", item: "Ardougne cloak 3" },
        { slot: "neck", item: "Amulet of glory" },
        { slot: "weapon", item: "Abyssal whip" },
        { slot: "body", item: "Fighter torso" },
        { slot: "shield", item: "Dragon defender" },
        { slot: "legs", item: "Torag's platelegs" },
        { slot: "hands", item: "Barrows gloves" },
        { slot: "feet", item: "Dragon boots" },
        { slot: "ring", item: "Berserker ring" }
      ]
    },
    {
      tier: "Med",
      note: "Reliable mid-price melee setup.",
      items: [
        { slot: "head", item: "Serpentine helm" },
        { slot: "cape", item: "Fire cape" },
        { slot: "neck", item: "Amulet of torture" },
        { slot: "weapon", item: "Osmumten's fang" },
        { slot: "body", item: "Bandos chestplate" },
        { slot: "shield", item: "Dragon defender" },
        { slot: "legs", item: "Bandos tassets" },
        { slot: "hands", item: "Ferocious gloves" },
        { slot: "feet", item: "Primordial boots" },
        { slot: "ring", item: "Berserker ring (i)" }
      ]
    },
    {
      tier: "High",
      note: "High-end melee damage.",
      items: [
        { slot: "head", item: "Torva full helm" },
        { slot: "cape", item: "Infernal cape" },
        { slot: "neck", item: "Amulet of rancour" },
        { slot: "weapon", item: "Scythe of vitur" },
        { slot: "body", item: "Torva platebody" },
        { slot: "shield", item: "Avernic defender" },
        { slot: "legs", item: "Torva platelegs" },
        { slot: "hands", item: "Ferocious gloves" },
        { slot: "feet", item: "Primordial boots" },
        { slot: "ring", item: "Ultor ring" }
      ]
    }
  ];
}

function getMoneyMethodNotes(activity: Activity) {
  const notes = [
    activity.metrics?.gpPerHour ? `${activity.metrics.gpPerHour.toLocaleString()} GP/hr listed from the OSRS Wiki guide.` : null,
    activity.moneyMaker?.category ? `${activity.moneyMaker.category} method.` : null,
    activity.moneyMaker?.intensity ? `${activity.moneyMaker.intensity} intensity.` : null
  ].filter((note): note is string => Boolean(note));

  return notes;
}

function GearSetupGrid({ activity }: { activity: Activity }) {
  const tierOrder = new Map<GearSetup["tier"], number>([
    ["Low", 1],
    ["Med", 2],
    ["High", 3]
  ]);
  const setups = useMemo(
    () => [...getGearSetups(activity)].sort((left, right) => (tierOrder.get(left.tier) ?? 99) - (tierOrder.get(right.tier) ?? 99)),
    [activity]
  );
  const styles = useMemo(() => [...new Set(setups.map((setup) => setup.style).filter((style): style is string => Boolean(style)))], [setups]);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<GearSetup["tier"]>("Med");
  const activeStyle = selectedStyle && styles.includes(selectedStyle) ? selectedStyle : styles[0];
  const styleSetups = activeStyle ? setups.filter((setup) => setup.style === activeStyle) : setups;
  const selectedSetup = styleSetups.find((setup) => setup.tier === selectedTier) ?? styleSetups[0] ?? setups[0];
  const strategySource = setups.find((setup) => setup.source)?.source;

  if (!selectedSetup) {
    return null;
  }

  return (
    <section>
      <div className="section-heading-row">
        <h3>Example gear</h3>
        <span className="section-heading-actions">
          {strategySource ? <a href={strategySource} rel="noreferrer" target="_blank">Strategy gear</a> : null}
          <a href={DPS_TOOL_URL} rel="noreferrer" target="_blank">Tune DPS</a>
        </span>
      </div>
      <div className="activity-filter-bar gear-picker" aria-label="Gear setup picker">
        {styles.length > 1 ? (
          <label>
            <span>Style</span>
            <select aria-label="Gear combat style" onChange={(event) => setSelectedStyle(event.target.value)} value={activeStyle}>
              {styles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span>Budget</span>
          <select aria-label="Gear budget" onChange={(event) => setSelectedTier(event.target.value as GearSetup["tier"])} value={selectedSetup.tier}>
            {styleSetups.map((setup) => (
              <option key={setup.tier} value={setup.tier}>
                {setup.tier}
              </option>
            ))}
          </select>
        </label>
      </div>
      <article className="gear-setup">
        <div className="gear-slots" aria-label={`${selectedSetup.tier} gear setup`}>
          {SLOT_ORDER.map((slot) => {
            const item = selectedSetup.items.find((gearItem) => gearItem.slot === slot);
            if (!item) {
              return (
                <div aria-label={`${SLOT_LABELS[slot]}: no item listed`} data-tooltip="No item listed" key={slot} tabIndex={0}>
                  <span>{SLOT_LABELS[slot]}</span>
                </div>
              );
            }

            return (
              <a
                aria-label={`${SLOT_LABELS[slot]}: ${item.item}`}
                className="has-item"
                data-tooltip={item.item}
                href={itemWikiUrl(item.item)}
                key={slot}
                rel="noreferrer"
                target="_blank"
              >
                <img alt="" aria-hidden="true" src={itemIcon(item.item)} />
              </a>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function UsefulLinks({ activity }: { activity: Activity }) {
  if (!activity.links?.wiki && activity.type !== "boss") {
    return null;
  }

  return (
    <section>
      <h3>Tools</h3>
      <div className="detail-link-row">
        {activity.links?.wiki ? (
          <a href={activity.links.wiki} rel="noreferrer" target="_blank">
            OSRS Wiki guide
          </a>
        ) : null}
        {activity.type === "boss" ? (
          <a href={DPS_TOOL_URL} rel="noreferrer" target="_blank">
            DPS calculator
          </a>
        ) : null}
      </div>
    </section>
  );
}

function CollectionLogDetail({ activity }: { activity: Activity }) {
  const collectionLogPage = activity.collectionLogPage;
  if (!collectionLogPage) {
    return null;
  }

  const pageProgress = collectionLogPage.total
    ? Math.round((collectionLogPage.obtained / Math.max(1, collectionLogPage.total)) * 100)
    : null;
  const accountProgress = Math.round((collectionLogPage.accountObtained / Math.max(1, collectionLogPage.accountTotal)) * 100);

  return (
    <section className="collection-log-detail">
      <h3>Collection log progress</h3>
      <div className="log-progress-grid">
        <div>
          <strong>
            {collectionLogPage.obtained}
            {collectionLogPage.total ? `/${collectionLogPage.total}` : ""} page slots
          </strong>
          <small>{pageProgress === null ? "Page total unavailable from this source" : `${pageProgress}% to green log`}</small>
        </div>
        <div>
          <strong>{collectionLogPage.accountObtained}/{collectionLogPage.accountTotal}</strong>
          <small>{accountProgress}% account log</small>
        </div>
      </div>
      {pageProgress !== null ? (
        <div className="progress-meter" aria-label={`${pageProgress} percent to green log`}>
          <span style={{ width: `${pageProgress}%` }} />
        </div>
      ) : null}
      <div className="log-item-columns">
        <div>
          <h4>Logged</h4>
          {collectionLogPage.loggedItems.length ? (
            <ul>
              {collectionLogPage.loggedItems.slice(0, 18).map((item) => (
                <li key={`${item.id}-${item.count}`}>{formatLogItem(item)}</li>
              ))}
            </ul>
          ) : (
            <p>No logged items are available for this page yet.</p>
          )}
        </div>
        <div>
          <h4>Not logged</h4>
          {collectionLogPage.missingItems?.length ? (
            <ul>
              {collectionLogPage.missingItems.slice(0, 18).map((item) => (
                <li key={item.id}>{item.name ?? `Item #${item.id}`}</li>
              ))}
            </ul>
          ) : (
            <p>{collectionLogPage.total ? "No missing items reported for this page." : "Exact missing items require a full collectionlog.net page sync."}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function MoneyDetail({ activity }: { activity: Activity }) {
  return (
    <>
      <section>
        <h3>Method</h3>
        <ul className="detail-note-list">
          {getMoneyMethodNotes(activity).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
      <RequirementList requirements={activity.requirements} />
      <RouteSteps steps={activity.route?.steps} title="How to do it" />
      <UsefulLinks activity={activity} />
    </>
  );
}

function BossDetail({ activity }: { activity: Activity }) {
  return (
    <>
      <section>
        <h3>Boss notes</h3>
        <ul className="detail-note-list">
          <li>{activity.boss?.category ?? "Boss"} encounter at {activity.locationName}.</li>
          {activity.boss?.difficulty ? <li>{activity.boss.difficulty} difficulty from the current boss data.</li> : null}
          {activity.metrics?.gpPerHour ? <li>{activity.metrics.gpPerHour.toLocaleString()} GP/hr estimate where available.</li> : null}
        </ul>
      </section>
      <RequirementList requirements={activity.requirements} />
      <RouteSteps steps={activity.route?.steps} title="How to get there" />
      <GearSetupGrid activity={activity} />
      <RewardList rewards={activity.rewards?.slice(0, 4)} title="Useful drops / tags" />
      <UsefulLinks activity={activity} />
    </>
  );
}

function QuestDetail({ activity }: { activity: Activity }) {
  return (
    <>
      <section>
        <h3>Quest state</h3>
        <p>{activity.summary || activity.description}</p>
      </section>
      <RequirementList requirements={activity.requirements} />
      <RouteSteps steps={activity.route?.steps} title="Start point" />
      <UsefulLinks activity={activity} />
    </>
  );
}

export function ActivityDetailCard({ activity, onClose }: { activity: Activity; onClose?: () => void }) {
  const tierLabel = activity.status === "ready" ? "Available now" : "Requirements needed";
  const icon = activity.icon ?? FALLBACK_ICONS[activity.type];

  return (
    <div className="activity-detail">
      <div className="detail-toolbar">
        <div className="detail-kicker">{tierLabel}</div>
        {onClose ? (
          <button aria-label="Close recommendation" className="detail-close" type="button" onClick={onClose}>
            X
          </button>
        ) : null}
      </div>
      <div className="detail-title-row">
        {icon ? <img alt="" aria-hidden="true" className="detail-activity-icon" src={icon} /> : null}
        <div>
          <h2>{activity.title}</h2>
          <p>{activity.locationName}</p>
        </div>
        <MetricPill activity={activity} />
      </div>
      <CollectionLogDetail activity={activity} />
      {activity.collectionLogPage ? null : activity.type === "boss" ? (
        <BossDetail activity={activity} />
      ) : activity.type === "money" ? (
        <MoneyDetail activity={activity} />
      ) : (
        <QuestDetail activity={activity} />
      )}
    </div>
  );
}
