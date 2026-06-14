"use client";

import type { Activity } from "@/lib/activities/types";
import { useMapStore } from "@/lib/store/useMapStore";
import { MetricPill } from "./MetricPill";

export function RecommendationStack({ activities, showTitle = true }: { activities: Activity[]; showTitle?: boolean }) {
  const focusActivity = useMapStore((state) => state.focusActivity);

  return (
    <section>
      {showTitle ? <h3>Recommended Next</h3> : null}
      <div className="recommendation-stack">
        {activities.map((activity) => (
          <button
            key={activity.id}
            type="button"
            onClick={() => focusActivity(activity)}
          >
            <span>
              <strong>{activity.title}</strong>
              <small>{activity.status}</small>
            </span>
            <MetricPill activity={activity} />
          </button>
        ))}
      </div>
    </section>
  );
}
