export function RouteSteps({ steps = [], title = "How to find it" }: { steps?: string[]; title?: string }) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>{title}</h3>
      <ol className="route-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
