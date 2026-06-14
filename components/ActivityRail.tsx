"use client";

import type { Activity } from "@/lib/activities/types";
import { ActivityRailItem } from "./ActivityRailItem";

export function ActivityRail({ activities }: { activities: Activity[] }) {
  return (
    <section className="activity-rail" aria-label="Activities in selected layer">
      {activities.map((activity) => (
        <ActivityRailItem activity={activity} key={activity.id} />
      ))}
    </section>
  );
}
