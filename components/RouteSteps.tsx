export function RouteSteps({ steps = [] }: { steps?: string[] }) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>Best Route</h3>
      <ol className="route-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
