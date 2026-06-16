import { publicPath } from "@/lib/publicPath";

const REWARD_ICON_RULES: Array<[RegExp, string]> = [
  [/\bbook of the dead\b/i, "Book of the dead"],
  [/\bantique lamps?\b/i, "Antique lamp"],
  [/\bquest points?\b/i, "Quest point icon"],
  [/\brespawn point\b|\brespawn\b/i, publicPath("/osrs-icons/quest-start.png")],
  [/\bArceuus spellbook\b|\bnew spells\b|\bspellbook\b/i, "Arceuus spellbook"],
  [/\bfight Yama\b|\bYama\b/i, "Yama"],
  [/\bcollection log\b|\blog slots?\b|\bgreen log\b/i, "Collection log"],
  [/\bGP\/hr\b|\bcoins?\b|\bgp\b/i, "Coins 10000"],
  [/\bcombat\b|\blevel \d+\b/i, "Combat icon"],
  [/\bexperience\b|\bxp\b/i, "Stats icon"]
];

function wikiFileIcon(fileName: string) {
  return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

function getRewardIcon(reward: string) {
  const match = REWARD_ICON_RULES.find(([pattern]) => pattern.test(reward));
  if (match) {
    if (match[1].startsWith("/")) {
      return match[1];
    }

    return wikiFileIcon(`${match[1]}.png`);
  }

  const firstSentence = reward.split(/[.;]/)[0].trim();
  const itemMatch = firstSentence.match(/^(?:The\s+)?([A-Z][A-Za-z0-9' -]+?)(?:\s+x\s*\d+|\s+\(\d+\))?$/);
  if (itemMatch?.[1] && itemMatch[1].split(/\s+/).length <= 5) {
    return wikiFileIcon(`${itemMatch[1]}.png`);
  }

  return undefined;
}

export function RewardList({ rewards = [], title = "Rewards" }: { rewards?: string[]; title?: string }) {
  if (rewards.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>{title}</h3>
      <div className="reward-list">
        {rewards.map((reward) => {
          const icon = getRewardIcon(reward);

          return (
            <span className="reward-item" key={reward}>
              {icon ? (
                <img
                  alt=""
                  aria-hidden="true"
                  onError={(event) => {
                    if (event.currentTarget.src.endsWith("/osrs-icons/quest-start.png")) {
                      return;
                    }
                    event.currentTarget.src = publicPath("/osrs-icons/quest-start.png");
                  }}
                  src={icon}
                />
              ) : <strong aria-hidden="true">+</strong>}
              <span className="reward-label">{reward}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
