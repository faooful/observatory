import type { Activity } from "@/lib/activities/types";
import { MetricPill } from "./MetricPill";
import { RequirementList } from "./RequirementList";
import { RewardList } from "./RewardList";
import { RouteSteps } from "./RouteSteps";

export function ActivityDetailCard({ activity }: { activity: Activity }) {
  return (
    <div className="activity-detail">
      <div className="detail-kicker">{activity.status}</div>
      <div className="detail-title-row">
        <div>
          <h2>{activity.title}</h2>
          <p>{activity.locationName}</p>
        </div>
        <MetricPill activity={activity} />
      </div>
      <section>
        <h3>Description</h3>
        <p>{activity.description}</p>
      </section>
      <RequirementList requirements={activity.requirements} />
      <RewardList rewards={activity.rewards} />
      <RouteSteps steps={activity.route?.steps} />
      {activity.links?.wiki ? (
        <a className="wiki-link" href={activity.links.wiki} rel="noreferrer" target="_blank">
          OSRS Wiki
        </a>
      ) : null}
    </div>
  );
}
