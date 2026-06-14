export function RewardList({ rewards = [] }: { rewards?: string[] }) {
  if (rewards.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>Rewards</h3>
      <div className="reward-list">
        {rewards.map((reward) => (
          <span key={reward}>+ {reward}</span>
        ))}
      </div>
    </section>
  );
}
