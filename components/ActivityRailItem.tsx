"use client";

import type { Activity } from "@/lib/activities/types";
import { useMapStore } from "@/lib/store/useMapStore";
import { MetricPill } from "./MetricPill";

export function ActivityRailItem({ activity }: { activity: Activity }) {
  const selectedActivityId = useMapStore((state) => state.selectedActivityId);
  const focusActivity = useMapStore((state) => state.focusActivity);

  return (
    <button
      className={`activity-rail-item is-${activity.status}${selectedActivityId === activity.id ? " is-active" : ""}`}
      type="button"
      onClick={() => focusActivity(activity)}
    >
      <span>
        <strong>{activity.title}</strong>
        <small>{activity.locationName}</small>
      </span>
      <MetricPill activity={activity} />
    </button>
  );
}
