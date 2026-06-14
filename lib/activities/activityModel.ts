import seeds from "@/data/activities/osrs-activities.json";
import { getSkillLevel, isQuestComplete, SKILL_ORDER, type PlayerLookup, type QuestMarker } from "@/lib/osrs/player";
import type { Activity, ActivityContext, ActivitySeed, ActivityState, ActivityType, Requirement } from "./types";

export const activitySeeds = seeds as ActivitySeed[];

export const ACTIVITY_LAYERS: Array<{ type: ActivityType; label: string }> = [
  { type: "quest", label: "Quests" },
  { type: "money", label: "Money" },
  { type: "boss", label: "Bosses" }
];

const MVP_ACTIVITY_TYPES = new Set<string>(["quest", "money", "boss"]);

const SKILLS_BY_LOWERCASE = new Map(SKILL_ORDER.map((skill) => [skill.toLowerCase(), skill]));

function evaluateRequirements(seed: ActivitySeed, context: ActivityContext): Requirement[] {
  return (seed.requirements ?? []).map((requirement) => {
    if (!context.player) {
      return {
        label: requirement.label,
        met: seed.baseState !== "blocked",
        detail: seed.baseState === "blocked" ? "Account check needed" : "Source requirement"
      };
    }

    if (requirement.skill && requirement.level) {
      const actualLevel = getSkillLevel(context.player.skills, requirement.skill);
      return {
        label: requirement.label,
        met: actualLevel >= requirement.level,
        detail: `${actualLevel}/${requirement.level}`
      };
    }

    if (requirement.quest) {
      return {
        label: requirement.label,
        met: isQuestComplete(context.player.quests, requirement.quest),
        detail: isQuestComplete(context.player.quests, requirement.quest) ? "Complete" : "Incomplete"
      };
    }

    return { label: requirement.label, met: true };
  });
}

function getSkillRequirement(requirement: string) {
  const normalizedRequirement = requirement.toLowerCase();
  for (const [lowercaseSkill, skill] of SKILLS_BY_LOWERCASE) {
    if (!normalizedRequirement.includes(lowercaseSkill)) {
      continue;
    }

    const levelMatch = normalizedRequirement.match(new RegExp(`(\\d{1,3})\\s+${lowercaseSkill.replace(/\s+/g, "\\s+")}`));
    if (levelMatch) {
      return {
        skill,
        level: Number(levelMatch[1])
      };
    }
  }

  return null;
}

function getQuestRequirement(requirement: string) {
  const completionMatch = requirement.match(/^Completion of\s+(.+?)(?:\s+no)?$/i);
  if (!completionMatch) {
    return null;
  }

  return completionMatch[1].replace(/^the following quests:\s*/i, "").trim();
}

function evaluateWikiQuestRequirements(marker: QuestMarker, player: PlayerLookup): Requirement[] {
  return (marker.wikiDetails?.requirements ?? []).slice(0, 10).map((requirement) => {
    const skillRequirement = getSkillRequirement(requirement);
    if (skillRequirement) {
      const actualLevel = getSkillLevel(player.skills, skillRequirement.skill);
      return {
        label: requirement,
        met: actualLevel >= skillRequirement.level,
        detail: `${actualLevel}/${skillRequirement.level}`
      };
    }

    const questRequirement = getQuestRequirement(requirement);
    if (questRequirement) {
      const met = isQuestComplete(player.quests, questRequirement);
      return {
        label: requirement,
        met,
        detail: met ? "Complete" : "Incomplete"
      };
    }

    return {
      label: requirement,
      met: true,
      detail: "OSRS Wiki"
    };
  });
}

function evaluateState(seed: ActivitySeed, requirements: Requirement[], context: ActivityContext): ActivityState {
  if (context.player && seed.questName && isQuestComplete(context.player.quests, seed.questName)) {
    return "completed";
  }

  if (requirements.some((requirement) => !requirement.met && requirement.detail !== "Account check needed")) {
    return "blocked";
  }

  if (seed.baseState === "recommended") {
    return "recommended";
  }

  if (seed.baseState === "completed") {
    return context.player ? "completed" : "ready";
  }

  if (seed.baseState === "blocked" && !context.player) {
    return "blocked";
  }

  return "ready";
}

function getDynamicQuestActivities(player: PlayerLookup): Activity[] {
  return player.questMarkers.map((marker) => {
    const requirements = evaluateWikiQuestRequirements(marker, player);
    const blocked = requirements.some((requirement) => !requirement.met);
    const routeSteps = [
      marker.wikiDetails?.start,
      marker.mapUrl ? "Use the map link to inspect the exact start area." : undefined,
      marker.wikiUrl ? "Open the OSRS Wiki guide for the full walkthrough." : undefined
    ].filter((step): step is string => Boolean(step));

    return {
      id: `quest-${marker.id}`,
      type: "quest",
      title: marker.questName,
      locationName: marker.wikiDetails?.start ?? marker.label,
      location: { x: marker.x, y: marker.y, z: marker.plane },
      coordinates: { x: marker.x, y: marker.y, z: marker.plane },
      state: blocked ? "blocked" : "ready",
      status: blocked ? "blocked" : "ready",
      description: marker.description,
      summary: marker.description,
      requirements,
      rewards: marker.wikiDetails?.items?.slice(0, 5).map((item) => `Bring: ${item}`),
      route: routeSteps.length ? { steps: routeSteps } : undefined,
      links: marker.wikiUrl ? { wiki: marker.wikiUrl } : undefined,
      recommendationReason: "Recommended from this account's incomplete WikiSync quests and OSRS Wiki start data."
    } satisfies Activity;
  });
}

export function getActivities(context: ActivityContext): Activity[] {
  const seedActivities: Activity[] = activitySeeds.filter((seed) => MVP_ACTIVITY_TYPES.has(seed.type) && (!context.player || seed.type !== "quest")).map((seed) => {
    const requirements = evaluateRequirements(seed, context);
    const state = evaluateState(seed, requirements, context);
    const status: Activity["status"] = state === "blocked" ? "blocked" : "ready";

    return {
      id: seed.id,
      type: seed.type,
      title: seed.title,
      locationName: seed.locationName,
      location: seed.coordinates,
      coordinates: seed.coordinates,
      state,
      status,
      description: seed.summary,
      summary: seed.summary,
      requirements,
      rewards: seed.rewards,
      metrics: seed.metrics,
      route: seed.route,
      links: seed.links,
      recommendationReason: seed.recommendationReason
    } satisfies Activity;
  });

  if (context.player?.questMarkers.length) {
    return [...getDynamicQuestActivities(context.player), ...seedActivities];
  }

  return seedActivities;
}

export function getVisibleActivities(activities: Activity[], type: ActivityType) {
  return activities.filter((activity) => activity.type === type && activity.state !== "completed");
}

export function getAccountVisibleActivities(activities: Activity[], type: ActivityType, context: ActivityContext) {
  return getVisibleActivities(activities, type);
}

export function sortRecommendations(activities: Activity[]) {
  const ranked = [...activities]
    .filter((activity) => activity.state !== "completed")
    .sort((a, b) => {
      const stateScore = (activity: Activity) =>
        activity.status === "ready" ? 4 : activity.status === "blocked" ? 1 : 0;
      const valueScore = (activity: Activity) =>
        (activity.metrics?.gpPerHour ?? 0) / 1000000 +
        (activity.metrics?.xpPerHour ?? 0) / 100000 +
        (activity.metrics?.popularity ?? 0) / 40 -
        (activity.metrics?.estimatedMinutes ?? 20) / 120;

      return stateScore(b) - stateScore(a) || valueScore(b) - valueScore(a);
    });

  const seenTitles = new Set<string>();
  return ranked.filter((activity) => {
    const key = activity.title.toLowerCase();
    if (seenTitles.has(key)) {
      return false;
    }
    seenTitles.add(key);
    return true;
  });
}
