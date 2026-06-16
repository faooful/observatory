"use client";

import { ACTIVITY_LAYERS, getAccountVisibleActivities, sortRecommendations } from "@/lib/activities/activityModel";
import type { Activity } from "@/lib/activities/types";
import { useMapStore } from "@/lib/store/useMapStore";
import { ActivityDetailCard } from "./ActivityDetailCard";
import { RecommendationStack } from "./RecommendationStack";

export function RightPanel({ activities }: { activities: Activity[] }) {
  const activeLayer = useMapStore((state) => state.activeLayer);
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const player = useMapStore((state) => state.player);
  const resetView = useMapStore((state) => state.resetView);
  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId);
  const recommendations = player ? sortRecommendations(activities) : [];
  const layerLabel = ACTIVITY_LAYERS.find((layer) => layer.type === activeLayer)?.label ?? "Activities";
  const visibleLayerActivities = getAccountVisibleActivities(activities, activeLayer, { player });

  return (
    <aside className="sidebar right-panel" aria-label="Profile and activity details">
      <div className="sidebar-header">
        <div>
          <div className="type-badge">{selectedActivity ? selectedActivity.type : "Profile"}</div>
          <h2>{selectedActivity ? selectedActivity.title : player?.username ?? "OSRS Progress"}</h2>
        </div>
        <button className="reset-button" type="button" onClick={resetView} aria-label="Reset view" title="Reset View">
          ↺
        </button>
      </div>

      {player ? (
        <div className="stat-grid">
          <div className="stat">
            <span>Total</span>
            <strong>{player.skills.Overall?.level ?? "-"}</strong>
          </div>
          <div className="stat">
            <span>Quests</span>
            <strong>{player.questSource === "wikisync" ? Object.values(player.quests).filter((state) => state === 2).length : "-"}</strong>
          </div>
          <div className="stat">
            <span>Layer</span>
            <strong>{layerLabel}</strong>
          </div>
        </div>
      ) : (
        <p>Look up an OSRS username to see activities the account can do now.</p>
      )}

      {selectedActivity ? (
        <ActivityDetailCard activity={selectedActivity} />
      ) : (
        <>
          {recommendations.length > 0 ? (
            <RecommendationStack activities={recommendations} />
          ) : (
            <p className="empty-state">Enter an OSRS username to show account-eligible activities.</p>
          )}
          <section>
            <h3>{layerLabel} Snapshot</h3>
            <div className="snapshot-grid">
              <div>
                <span>Ready</span>
                <strong>{visibleLayerActivities.filter((activity) => activity.state === "ready").length}</strong>
              </div>
              <div>
                <span>Eligible</span>
                <strong>{visibleLayerActivities.filter((activity) => activity.status === "ready").length}</strong>
              </div>
              <div>
                <span>Blocked</span>
                <strong>{visibleLayerActivities.filter((activity) => activity.state === "blocked").length}</strong>
              </div>
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
