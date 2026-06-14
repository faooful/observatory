"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ActivityDetailCard } from "@/components/ActivityDetailCard";
import { ActivityLayerTabs } from "@/components/ActivityLayerTabs";
import { MetricPill } from "@/components/MetricPill";
import { RecommendationStack } from "@/components/RecommendationStack";
import { ACTIVITY_LAYERS, getActivities, getVisibleActivities, sortRecommendations } from "@/lib/activities/activityModel";
import type { Activity } from "@/lib/activities/types";
import { type PlayerLookup } from "@/lib/osrs/player";
import { useMapStore } from "@/lib/store/useMapStore";

const HISTORY_KEY = "observatory:osrs-username-history";
const MAX_HISTORY = 5;
type PanelId = "focus" | "goals" | "snapshot";

function CollapsiblePanel({
  children,
  className,
  collapsed,
  onToggle,
  title
}: {
  children: ReactNode;
  className: string;
  collapsed: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className={`hud-panel ${className}${collapsed ? " is-collapsed" : ""}`}>
      <button className="panel-toggle" type="button" onClick={onToggle} aria-expanded={!collapsed}>
        <span>
          <strong>{title}</strong>
        </span>
        <span className="panel-caret" aria-hidden="true">
          v
        </span>
      </button>
      {!collapsed ? <div className="panel-content">{children}</div> : null}
    </section>
  );
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

function ActivityList({ activities }: { activities: Activity[] }) {
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const selectActivity = useMapStore((state) => state.selectActivity);

  return (
    <div className="pin-list activity-list">
      {activities.map((activity) => (
        <button
          className={`pin-button is-${activity.status}${activity.id === selectedActivityId ? " is-active" : ""}`}
          key={activity.id}
          type="button"
          onClick={() => selectActivity(activity.id)}
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

export function ActivitySidebar() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<PanelId, boolean>>({
    focus: false,
    goals: false,
    snapshot: false
  });
  const activeLayer = useMapStore((state) => state.activeLayer);
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const resetView = useMapStore((state) => state.resetView);
  const player = useMapStore((state) => state.player);
  const setPlayer = useMapStore((state) => state.setPlayer);
  const activities = useMemo(() => getActivities({ player }), [player]);
  const visibleActivities = useMemo(() => (player ? getVisibleActivities(activities, activeLayer) : []), [activities, activeLayer, player]);
  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId);
  const recommendations = useMemo(() => (player ? sortRecommendations(activities).slice(0, 3) : []), [activities, player]);
  const layerLabel = ACTIVITY_LAYERS.find((layer) => layer.type === activeLayer)?.label ?? "Activities";
  const completedQuestCount = useMemo(() => Object.values(player?.quests ?? {}).filter((state) => state === 2).length, [player?.quests]);

  useEffect(() => {
    const nextHistory = readHistory();
    setUsername((current) => current || nextHistory[0] || "");
  }, []);

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

  const returnToLookup = () => {
    setError(null);
    setPlayer(null);
    resetView();
  };

  const togglePanel = (panelId: PanelId) => {
    setCollapsedPanels((current) => ({
      ...current,
      [panelId]: !current[panelId]
    }));
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
            <div>
              <span>Player</span>
              <strong>{player.username}</strong>
            </div>
            <button type="button" onClick={returnToLookup}>
              Change
            </button>
          </header>

          <CollapsiblePanel
            className="hud-panel--upper-right"
            collapsed={collapsedPanels.focus}
            onToggle={() => togglePanel("focus")}
            title="Focus"
          >
            <div className="panel-property-row">
              <span>Layer</span>
              <strong>{layerLabel}</strong>
            </div>
            <ActivityLayerTabs />

            <div className="stat-grid">
              <div className="stat">
                <span>Total</span>
                <strong>{player.skills.Overall?.level ?? "-"}</strong>
              </div>
              <div className="stat">
                <span>Quests</span>
                <strong>{player.questSource === "wikisync" ? completedQuestCount : "-"}</strong>
              </div>
              <div className="stat">
                <span>Layer</span>
                <strong>{layerLabel}</strong>
              </div>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            className="hud-panel--lower-left"
            collapsed={collapsedPanels.goals}
            onToggle={() => togglePanel("goals")}
            title="Goals"
          >
            <div className="panel-property-row">
              <span>Recommended</span>
              <strong>Next best activities</strong>
            </div>
            <RecommendationStack activities={recommendations} showTitle={false} />
          </CollapsiblePanel>

          <CollapsiblePanel
            className="hud-panel--lower-right"
            collapsed={collapsedPanels.snapshot}
            onToggle={() => togglePanel("snapshot")}
            title="Snapshot"
          >
            <div className="panel-property-row">
              <span>{selectedActivity ? "Selected" : "Layer"}</span>
              <strong>{selectedActivity ? selectedActivity.title : layerLabel}</strong>
            </div>
            {selectedActivity ? <ActivityDetailCard activity={selectedActivity} /> : <ActivityList activities={visibleActivities.slice(0, 6)} />}
          </CollapsiblePanel>
        </div>
      )}
    </aside>
  );
}
