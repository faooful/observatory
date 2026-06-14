import type { Requirement } from "@/lib/activities/types";

export function RequirementList({ requirements = [] }: { requirements?: Requirement[] }) {
  if (requirements.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>Requirements</h3>
      <div className="check-list">
        {requirements.map((requirement) => (
          <div className={requirement.met ? "is-met" : "is-missing"} key={requirement.label}>
            <span>{requirement.met ? "✓" : "!"}</span>
            <strong>{requirement.label}</strong>
            {requirement.detail ? <small>{requirement.detail}</small> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
