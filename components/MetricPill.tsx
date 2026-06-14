import type { Activity } from "@/lib/activities/types";

function compactNumber(value: number) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}m`;
  }

  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }

  return String(value);
}

export function MetricPill({ activity }: { activity: Activity }) {
  if (activity.metrics?.gpPerHour) {
    return <span className="metric-pill">{compactNumber(activity.metrics.gpPerHour)}/hr</span>;
  }

  if (activity.metrics?.xpPerHour) {
    return <span className="metric-pill">{compactNumber(activity.metrics.xpPerHour)} xp/hr</span>;
  }

  if (activity.metrics?.estimatedMinutes) {
    return <span className="metric-pill">{activity.metrics.estimatedMinutes} min</span>;
  }

  if (activity.metrics?.difficulty) {
    return <span className="metric-pill">T{activity.metrics.difficulty}</span>;
  }

  return <span className="metric-pill">{activity.status}</span>;
}
