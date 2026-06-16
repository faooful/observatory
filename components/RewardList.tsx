export function RewardList({ rewards = [], title = "Rewards" }: { rewards?: string[]; title?: string }) {
  if (rewards.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>{title}</h3>
      <div className="reward-list">
        {rewards.map((reward) => (
          <span key={reward}>+ {reward}</span>
        ))}
      </div>
    </section>
  );
}
