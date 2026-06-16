import type { Requirement } from "@/lib/activities/types";

function getRequirementIcon(requirement: Requirement) {
  if (requirement.skill === "Combat") {
    return "/osrs-icons/combat.png";
  }

  if (requirement.skill) {
    return `https://oldschool.runescape.wiki/images/${requirement.skill.replace(/\s+/g, "_")}_icon.png`;
  }

  if (requirement.quest) {
    return "/osrs-icons/quest-start.png";
  }

  return null;
}

export function RequirementList({ requirements = [] }: { requirements?: Requirement[] }) {
  if (requirements.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>Account checks</h3>
      <div className="check-list">
        {requirements.map((requirement) => {
          const icon = getRequirementIcon(requirement);

          return (
            <div className={requirement.met ? "is-met" : "is-missing"} key={requirement.label}>
              {icon ? <img alt="" aria-hidden="true" src={icon} /> : <span aria-hidden="true">{requirement.met ? "✓" : "!"}</span>}
              <strong>{requirement.label}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
