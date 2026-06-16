"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ActivityDetailCard } from "@/components/ActivityDetailCard";
import { getActivities, getTabActivities } from "@/lib/activities/activityModel";
import type { Activity, ActivityType } from "@/lib/activities/types";
import { type PlayerLookup } from "@/lib/osrs/player";
import { useMapStore } from "@/lib/store/useMapStore";

const HISTORY_KEY = "observatory:osrs-username-history";
const MAX_HISTORY = 5;

const ACTIVITY_PANEL_LABELS: Record<ActivityType, string> = {
  quest: "Quests",
  money: "Money",
  boss: "Bosses",
  skilling: "Skilling",
  diary: "Diaries",
  clue: "Collection Log"
};

const ACTIVITY_PANEL_ICONS: Partial<Record<ActivityType, string>> = {
  quest: "/osrs-icons/quest-start.png",
  money: "/osrs-icons/coins-10000.png",
  boss: "/osrs-icons/combat.png",
  clue: "/osrs-icons/collection-log.png"
};

const ACTIVITY_TABS: ActivityType[] = ["quest", "money", "boss"];

function getUniqueSortedValues(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));
}

function readHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function writeHistory(username: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = username.trim();
  if (!normalized) {
    return;
  }

  const nextHistory = [normalized, ...readHistory().filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())].slice(0, MAX_HISTORY);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
}

function ActivityTabList({ activities }: { activities: Activity[] }) {
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const focusActivity = useMapStore((state) => state.focusActivity);
  const getFallbackIcon = (activity: Activity) => ACTIVITY_PANEL_ICONS[activity.type] ?? "/osrs-icons/compass.png";

  if (activities.length === 0) {
    return null;
  }

  return (
    <section className="recommendation-group" aria-label="Activities">
      <div className="recommendation-list">
        {activities.map((activity) => (
          <button
            className={`recommendation-button is-${activity.status === "ready" ? "readyNow" : "longTerm"}${activity.id === selectedActivityId ? " is-active" : ""}`}
            key={activity.id}
            type="button"
            onClick={() => focusActivity(activity)}
          >
            <span className="recommendation-icon" aria-hidden="true">
              <img
                alt=""
                src={activity.icon ?? getFallbackIcon(activity)}
                onError={(event) => {
                  const fallback = getFallbackIcon(activity);
                  if (event.currentTarget.src !== fallback) {
                    event.currentTarget.src = fallback;
                  }
                }}
              />
            </span>
            <span className="recommendation-copy">
              <strong>{activity.title}</strong>
              <small>{activity.summary || activity.locationName}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ActivitySidebar() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ActivityType | null>("money");
  const [moneyCategoryFilter, setMoneyCategoryFilter] = useState("all");
  const [moneyIntensityFilter, setMoneyIntensityFilter] = useState("all");
  const [bossCategoryFilter, setBossCategoryFilter] = useState("all");
  const [bossDifficultyFilter, setBossDifficultyFilter] = useState("all");
  const [mapOnly, setMapOnly] = useState(false);
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const resetView = useMapStore((state) => state.resetView);
  const clearSelection = useMapStore((state) => state.clearSelection);
  const player = useMapStore((state) => state.player);
  const setPlayer = useMapStore((state) => state.setPlayer);
  const focusActivity = useMapStore((state) => state.focusActivity);
  const activities = useMemo(() => getActivities({ player }), [player]);
  const tabActivitiesByType = useMemo(
    () => ({
      quest: getTabActivities({ player }, "quest"),
      money: getTabActivities({ player }, "money"),
      boss: getTabActivities({ player }, "boss")
    }),
    [player]
  );
  const allTabActivities = useMemo(
    () => [...tabActivitiesByType.quest, ...tabActivitiesByType.money, ...tabActivitiesByType.boss],
    [tabActivitiesByType]
  );
  const moneyCategoryOptions = useMemo(
    () => getUniqueSortedValues(tabActivitiesByType.money.map((activity) => activity.moneyMaker?.category)),
    [tabActivitiesByType.money]
  );
  const moneyIntensityOptions = useMemo(() => {
    const sortOrder = new Map([
      ["Low", 1],
      ["Moderate", 2],
      ["High", 3],
      ["Unknown", 4]
    ]);

    return getUniqueSortedValues(tabActivitiesByType.money.map((activity) => activity.moneyMaker?.intensity)).sort(
      (left, right) => (sortOrder.get(left) ?? 99) - (sortOrder.get(right) ?? 99) || left.localeCompare(right)
    );
  }, [tabActivitiesByType.money]);
  const bossCategoryOptions = useMemo(
    () => getUniqueSortedValues(tabActivitiesByType.boss.map((activity) => activity.boss?.category)),
    [tabActivitiesByType.boss]
  );
  const bossDifficultyOptions = useMemo(() => {
    const sortOrder = new Map([
      ["Low", 1],
      ["Mid", 2],
      ["High", 3],
      ["Very high", 4],
      ["Raid", 5],
      ["Unknown", 6]
    ]);

    return getUniqueSortedValues(tabActivitiesByType.boss.map((activity) => activity.boss?.difficulty)).sort(
      (left, right) => (sortOrder.get(left) ?? 99) - (sortOrder.get(right) ?? 99) || left.localeCompare(right)
    );
  }, [tabActivitiesByType.boss]);
  const activeActivities = useMemo(() => {
    if (!activeCategory) {
      return [];
    }

    const categoryActivities = tabActivitiesByType[activeCategory as keyof typeof tabActivitiesByType] ?? [];
    if (activeCategory !== "money") {
      if (activeCategory !== "boss") {
        return categoryActivities;
      }

      return categoryActivities.filter((activity) => {
        const matchesCategory = bossCategoryFilter === "all" || activity.boss?.category === bossCategoryFilter;
        const matchesDifficulty = bossDifficultyFilter === "all" || activity.boss?.difficulty === bossDifficultyFilter;
        return matchesCategory && matchesDifficulty;
      });
    }

    return categoryActivities.filter((activity) => {
      const matchesCategory = moneyCategoryFilter === "all" || activity.moneyMaker?.category === moneyCategoryFilter;
      const matchesIntensity = moneyIntensityFilter === "all" || activity.moneyMaker?.intensity === moneyIntensityFilter;
      return matchesCategory && matchesIntensity;
    });
  }, [activeCategory, bossCategoryFilter, bossDifficultyFilter, moneyCategoryFilter, moneyIntensityFilter, tabActivitiesByType]);
  const activeCategoryCount = activeActivities.length;
  const activeEmptyLabel = activeCategory === "quest"
    ? "No startable quests found for this account."
    : activeCategory === "money"
      ? "No eligible money makers found for this account yet."
      : "No eligible bosses found for this account yet.";
  const selectedRecommendation = useMemo(
    () => allTabActivities.find((activity) => activity.id === selectedActivityId) ?? null,
    [allTabActivities, selectedActivityId]
  );
  const completedQuestCount = useMemo(() => Object.values(player?.quests ?? {}).filter((state) => state === 2).length, [player?.quests]);
  const collectionLogLabel = player?.collectionLog ? `${player.collectionLog.uniqueObtained}/${player.collectionLog.uniqueItems}` : "-";

  const updateHistory = (nextUsername: string) => {
    writeHistory(nextUsername);
    setUsername(nextUsername);
  };

  const lookupPlayer = async (nextUsername: string) => {
    const normalized = nextUsername.trim();
    if (!normalized) {
      return;
    }

    setLoading(true);
    setError(null);
    setPlayer(null);

    try {
      const response = await fetch(`/api/player?username=${encodeURIComponent(normalized)}`);
      const payload = (await response.json()) as PlayerLookup | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Could not load player.");
      }

      setPlayer(payload as PlayerLookup);
      updateHistory(normalized);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load player.");
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await lookupPlayer(username);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const playerParam = params.get("player");
    const mapParam = params.get("map");
    const activityParam = params.get("recommendation") ?? params.get("activity");

    if (activityParam) {
      setPendingActivityId(activityParam);
    }

    if (playerParam) {
      setMapOnly(false);
      setUsername(playerParam);
      void lookupPlayer(playerParam);
      return;
    }

    if (mapParam === "1") {
      setMapOnly(true);
    }

    const nextHistory = readHistory();
    setUsername((current) => current || nextHistory[0] || "");
  }, []);

  useEffect(() => {
    if (!pendingActivityId || !player) {
      return;
    }

    const pendingActivity = activities.find((activity) => activity.id === pendingActivityId);
    if (pendingActivity) {
      focusActivity(pendingActivity);
    }
    setPendingActivityId(null);
  }, [activities, focusActivity, pendingActivityId, player]);

  useEffect(() => {
    if (typeof window === "undefined" || !player) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("player", player.username);
    if (selectedActivityId) {
      params.set("recommendation", selectedActivityId);
    } else {
      params.delete("recommendation");
    }
    params.delete("activity");
    params.delete("layer");

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [player, selectedActivityId]);

  const returnToLookup = () => {
    setError(null);
    setPlayer(null);
    setMapOnly(false);
    resetView();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("player");
      params.delete("layer");
      params.delete("activity");
      params.delete("recommendation");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }
  };

  return (
    <aside className="sidebar overlay-shell" aria-label="Observatory controls">
      {!player && !mapOnly ? (
        <section className="intro-overlay" aria-label="Enter OSRS username">
          <h1 className="intro-title">Explore Gielinor</h1>
          <div className="intro-actions">
            <form className="intro-card" onSubmit={handleSubmit}>
              <span className="intro-plus" aria-hidden="true">
                +
              </span>
              <label className="sr-only" htmlFor="osrs-username">
                OSRS username
              </label>
              <input
                aria-label="OSRS username"
                autoComplete="off"
                autoFocus
                disabled={loading}
                id="osrs-username"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="OSRS username"
                value={username}
              />
              <button className="intro-submit" type="submit" disabled={loading || !username.trim()} aria-label="Lookup username">
                →
              </button>
            </form>
            <button className="map-only-button" type="button" onClick={() => setMapOnly(true)}>
              View Map
            </button>
          </div>
          {error ? <p className="notice is-error intro-error">{error}</p> : null}
        </section>
      ) : !player ? (
        <div className="hud-grid hud-grid--map-only">
          <section className="map-view-prompt" aria-label="Account lookup">
            <div>
              <strong>Viewing map</strong>
              <span>Enter a username to see what the account can do</span>
            </div>
            <button type="button" onClick={() => setMapOnly(false)}>
              Enter
            </button>
          </section>
        </div>
      ) : (
        <div className="hud-grid hud-grid--active">
          <header className="account-bar" aria-label="Current player">
            <div className="account-main">
              <strong>{player.username}</strong>
              <dl className="account-stats">
                <div>
                  <dt>Total</dt>
                  <dd>{player.skills.Overall?.level ?? "-"}</dd>
                </div>
                <div>
                  <dt>Combat</dt>
                  <dd>{player.combatLevel ?? "-"}</dd>
                </div>
                <div>
                  <dt>Quests</dt>
                  <dd>{player.questSource === "wikisync" ? completedQuestCount : "-"}</dd>
                </div>
                <div>
                  <dt>Log</dt>
                  <dd>{collectionLogLabel}</dd>
                </div>
              </dl>
            </div>
            <button type="button" onClick={returnToLookup}>
              Change
            </button>
          </header>
          <section
            className={`activity-dock recommendation-dashboard${activeCategory ? "" : " is-closed"}`}
            aria-label="Available account activities"
          >
            <nav className="activity-dock-tabs recommendation-tabs" aria-label="Available activity categories">
              {ACTIVITY_TABS.map((category) => (
                <button
                  aria-label={`${ACTIVITY_PANEL_LABELS[category]} the account can do`}
                  aria-pressed={activeCategory === category}
                  className={activeCategory === category ? "is-active" : ""}
                  key={category}
                  onClick={() => {
                    setActiveCategory((currentCategory) => (currentCategory === category ? null : category));
                    clearSelection();
                  }}
                  title={ACTIVITY_PANEL_LABELS[category]}
                  type="button"
                >
                  {ACTIVITY_PANEL_ICONS[category] ? (
                    <img alt="" aria-hidden="true" className="activity-dock-icon" src={ACTIVITY_PANEL_ICONS[category]} />
                  ) : (
                    <span>{ACTIVITY_PANEL_LABELS[category].slice(0, 2)}</span>
                  )}
                </button>
              ))}
            </nav>
            {activeCategory ? (
              <>
                {selectedRecommendation ? (
                  <ActivityDetailCard activity={selectedRecommendation} onClose={clearSelection} />
                ) : (
                  <div className="recommendation-groups">
                    {activeCategory === "quest" ? (
                      <div className="tab-summary-line">({activeCategoryCount}) Startable quests</div>
                    ) : activeCategory === "money" ? (
                      <div className="tab-summary-line">({activeCategoryCount}) Money makers you can do</div>
                    ) : activeCategory === "boss" ? (
                      <div className="tab-summary-line">({activeCategoryCount}) Bosses you can do</div>
                    ) : null}
                    {activeCategory === "money" ? (
                      <div className="activity-filter-bar" aria-label="Money maker filters">
                        <label>
                          <span>Category</span>
                          <select
                            aria-label="Money maker category"
                            value={moneyCategoryFilter}
                            onChange={(event) => {
                              setMoneyCategoryFilter(event.target.value);
                              clearSelection();
                            }}
                          >
                            <option value="all">All</option>
                            {moneyCategoryOptions.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Intensity</span>
                          <select
                            aria-label="Money maker intensity"
                            value={moneyIntensityFilter}
                            onChange={(event) => {
                              setMoneyIntensityFilter(event.target.value);
                              clearSelection();
                            }}
                          >
                            <option value="all">All</option>
                            {moneyIntensityOptions.map((intensity) => (
                              <option key={intensity} value={intensity}>
                                {intensity}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : activeCategory === "boss" ? (
                      <div className="activity-filter-bar" aria-label="Boss filters">
                        <label>
                          <span>Category</span>
                          <select
                            aria-label="Boss category"
                            value={bossCategoryFilter}
                            onChange={(event) => {
                              setBossCategoryFilter(event.target.value);
                              clearSelection();
                            }}
                          >
                            <option value="all">All</option>
                            {bossCategoryOptions.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Difficulty</span>
                          <select
                            aria-label="Boss difficulty"
                            value={bossDifficultyFilter}
                            onChange={(event) => {
                              setBossDifficultyFilter(event.target.value);
                              clearSelection();
                            }}
                          >
                            <option value="all">All</option>
                            {bossDifficultyOptions.map((difficulty) => (
                              <option key={difficulty} value={difficulty}>
                                {difficulty}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}
                    <ActivityTabList activities={activeActivities} />
                    {activeCategoryCount === 0 ? (
                      <p className="empty-state">{activeEmptyLabel}</p>
                    ) : null}
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      )}
    </aside>
  );
}
