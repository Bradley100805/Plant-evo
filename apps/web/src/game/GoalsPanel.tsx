import type { EpochView, GoalView } from './protocol.ts';

/** The chapter's goals with progress, judged on the latest epoch. */
export function GoalsPanel({ goals, epochs }: { goals: GoalView[]; epochs: EpochView[] }) {
  const done = goals.filter((g) => g.achievedIn !== null).length;
  return (
    <section className="card goals" aria-labelledby="goals-title">
      <h3 id="goals-title">Goals</h3>
      <p className="subtitle">
        {done} of {goals.length} reached. Progress is measured at the end of each epoch.
      </p>
      <ul>
        {goals.map((goal) => {
          const achieved = goal.achievedIn !== null;
          return (
            <li key={goal.id} className={achieved ? 'achieved' : undefined}>
              <span className="goal-icon" aria-hidden="true">
                {achieved ? '✓' : ''}
              </span>
              <div className="goal-body">
                <strong>{goal.title}</strong>
                <span className="goal-description">{goal.description}</span>
                {achieved ? (
                  <span className="goal-status">
                    Reached {epochs[goal.achievedIn ?? 0].ma} million years ago
                  </span>
                ) : (
                  <div
                    className="goal-progress"
                    role="progressbar"
                    aria-label={`${goal.title} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(goal.progress * 100)}
                  >
                    <div style={{ width: `${goal.progress * 100}%` }} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
