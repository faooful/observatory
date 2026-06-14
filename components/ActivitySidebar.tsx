"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MetricPill } from "@/components/MetricPill";
import { getActivities, getVisibleActivities, sortRecommendations } from "@/lib/activities/activityModel";
import type { Activity, ActivityType } from "@/lib/activities/types";
import { type PlayerLookup } from "@/lib/osrs/player";
import { useMapStore } from "@/lib/store/useMapStore";

const HISTORY_KEY = "observatory:osrs-username-history";
const MAX_HISTORY = 5;

const ACTIVITY_PANEL_LABELS: Record<ActivityType, string> = {
  quest: "Quests",
  money: "Money",
  boss: "Bosses"
};

const ACTIVITY_PANEL_SHORT_LABELS: Record<ActivityType, string> = {
  quest: "Q",
  money: "$",
  boss: "B"
};

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

function isActivityType(value: string | null): value is ActivityType {
  return value === "quest" || value === "money" || value === "boss";
}

function parseWorldCoordinates(value: string) {
  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function ActivityList({ activities }: { activities: Activity[] }) {
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const focusActivity = useMapStore((state) => state.focusActivity);

  return (
    <div className="pin-list activity-list">
      {activities.map((activity) => (
        <button
          className={`pin-button is-${activity.status}${activity.id === selectedActivityId ? " is-active" : ""}`}
          key={activity.id}
          type="button"
          onClick={() => focusActivity(activity)}
        >
          <span>
            <strong>{activity.title}</strong>
            <small>{activity.locationName}</small>
          </span>
          <MetricPill activity={activity} />
        </button>
      ))}
    </div>
  );
}

function LocateCommand({ activities }: { activities: Activity[] }) {
  const [query, setQuery] = useState("");
  const focusActivity = useMapStore((state) => state.focusActivity);
  const focusLocation = useMapStore((state) => state.focusLocation);
  const coordinateResult = useMemo(() => parseWorldCoordinates(query), [query]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || coordinateResult) {
      return [];
    }

    return activities
      .filter((activity) => {
        const haystack = `${activity.title} ${activity.locationName} ${activity.type}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 6);
  }, [activities, coordinateResult, query]);

  const chooseActivity = (activity: Activity) => {
    focusActivity(activity);
    setQuery("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (coordinateResult) {
      focusLocation({
        x: coordinateResult.x,
        y: coordinateResult.y,
        label: `${coordinateResult.x}, ${coordinateResult.y}`
      });
      setQuery("");
      return;
    }

    if (results[0]) {
      chooseActivity(results[0]);
    }
  };

  return (
    <form className="locate-command" onSubmit={submit}>
      <label className="sr-only" htmlFor="activity-locate">
        Locate activity or world coordinates
      </label>
      <input
        autoComplete="off"
        id="activity-locate"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find or x,y"
        value={query}
      />
      <button type="submit" disabled={!coordinateResult && results.length === 0}>
        Go
      </button>
      {(coordinateResult || results.length > 0) && (
        <div className="locate-results">
          {coordinateResult ? (
            <button
              type="button"
              onClick={() => {
                focusLocation({ ...coordinateResult, label: `${coordinateResult.x}, ${coordinateResult.y}` });
                setQuery("");
              }}
            >
              <span>{coordinateResult.x}, {coordinateResult.y}</span>
              <small>World coordinate</small>
            </button>
          ) : (
            results.map((activity) => (
              <button key={activity.id} type="button" onClick={() => chooseActivity(activity)}>
                <span>{activity.title}</span>
                <small>{activity.locationName} / {ACTIVITY_PANEL_LABELS[activity.type]}</small>
              </button>
            ))
          )}
        </div>
      )}
    </form>
  );
}

function ActivityDock({
  activeLayer,
  activitiesByLayer,
  dockOpen,
  onSelectLayer
}: {
  activeLayer: ActivityType;
  activitiesByLayer: Record<ActivityType, Activity[]>;
  dockOpen: boolean;
  onSelectLayer: (layer: ActivityType) => void;
}) {
  const activeActivities = activitiesByLayer[activeLayer];
  const readyCount = activeActivities.filter((activity) => activity.status === "ready").length;
  const blockedCount = activeActivities.filter((activity) => activity.status === "blocked").length;
  const totalCount = activeActivities.length;

  return (
    <section className={`activity-dock${dockOpen ? "" : " is-closed"}`} aria-label="Activity layers">
      {dockOpen && (
        <div className="activity-dock-body">
          <div className="activity-dock-header">
            <div>
              <span>Activities</span>
              <strong>{ACTIVITY_PANEL_LABELS[activeLayer]}</strong>
            </div>
            <small>{totalCount} total</small>
          </div>
          <div className="activity-dock-summary">
            <div>
              <span>Ready</span>
              <strong>{readyCount}</strong>
            </div>
            <div>
              <span>Blocked</span>
              <strong>{blockedCount}</strong>
            </div>
          </div>
          <ActivityList activities={activeActivities} />
        </div>
      )}
      <nav className="activity-dock-tabs" aria-label="Switch activity layer">
        {(["quest", "money", "boss"] as ActivityType[]).map((layer) => (
          <button
            aria-label={dockOpen && activeLayer === layer ? `Close ${ACTIVITY_PANEL_LABELS[layer]}` : ACTIVITY_PANEL_LABELS[layer]}
            className={activeLayer === layer ? "is-active" : ""}
            key={layer}
            onClick={() => onSelectLayer(layer)}
            title={ACTIVITY_PANEL_LABELS[layer]}
            type="button"
          >
            <span aria-hidden="true">{ACTIVITY_PANEL_SHORT_LABELS[layer]}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}

export function ActivitySidebar() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(true);
  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null);
  const activeLayer = useMapStore((state) => state.activeLayer);
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const resetView = useMapStore((state) => state.resetView);
  const player = useMapStore((state) => state.player);
  const setPlayer = useMapStore((state) => state.setPlayer);
  const setActiveLayer = useMapStore((state) => state.setActiveLayer);
  const focusActivity = useMapStore((state) => state.focusActivity);
  const activities = useMemo(() => getActivities({ player }), [player]);
  const questActivities = useMemo(() => (player ? sortRecommendations(getVisibleActivities(activities, "quest")) : []), [activities, player]);
  const moneyActivities = useMemo(() => (player ? sortRecommendations(getVisibleActivities(activities, "money")) : []), [activities, player]);
  const bossActivities = useMemo(() => (player ? sortRecommendations(getVisibleActivities(activities, "boss")) : []), [activities, player]);
  const activitiesByLayer = useMemo<Record<ActivityType, Activity[]>>(
    () => ({
      quest: questActivities,
      money: moneyActivities,
      boss: bossActivities
    }),
    [bossActivities, moneyActivities, questActivities]
  );
  const completedQuestCount = useMemo(() => Object.values(player?.quests ?? {}).filter((state) => state === 2).length, [player?.quests]);

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
    const layerParam = params.get("layer");
    const activityParam = params.get("activity");

    if (isActivityType(layerParam)) {
      setActiveLayer(layerParam);
    }

    if (activityParam) {
      setPendingActivityId(activityParam);
    }

    if (playerParam) {
      setUsername(playerParam);
      void lookupPlayer(playerParam);
      return;
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
    params.set("layer", activeLayer);
    if (selectedActivityId) {
      params.set("activity", selectedActivityId);
    } else {
      params.delete("activity");
    }

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [activeLayer, player, selectedActivityId]);

  const returnToLookup = () => {
    setError(null);
    setPlayer(null);
    resetView();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("player");
      params.delete("layer");
      params.delete("activity");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }
  };

  const selectDockLayer = (layer: ActivityType) => {
    if (dockOpen && layer === activeLayer) {
      setDockOpen(false);
      return;
    }

    setDockOpen(true);
    if (layer !== activeLayer) {
      setActiveLayer(layer);
    }
  };

  return (
    <aside className="sidebar overlay-shell" aria-label="Observatory controls">
      {!player ? (
        <section className="intro-overlay" aria-label="Enter OSRS username">
          <h1 className="intro-title">What&apos;s on the agenda today?</h1>
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
          {error ? <p className="notice is-error intro-error">{error}</p> : null}
        </section>
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
                  <dt>Quests</dt>
                  <dd>{player.questSource === "wikisync" ? completedQuestCount : "-"}</dd>
                </div>
              </dl>
            </div>
            <button type="button" onClick={returnToLookup}>
              Change
            </button>
          </header>
          <LocateCommand activities={activities} />

          <ActivityDock activeLayer={activeLayer} activitiesByLayer={activitiesByLayer} dockOpen={dockOpen} onSelectLayer={selectDockLayer} />
        </div>
      )}
    </aside>
  );
}
