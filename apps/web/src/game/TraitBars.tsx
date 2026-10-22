import { TRAIT_IDS, TRAIT_INFO } from '@plant-evo/sim';

/** The lineage's mean trait values as bars, with the change since the previous epoch. */
export function TraitBars({
  means,
  previous,
  onInfo,
}: {
  means: number[];
  previous?: number[];
  onInfo: (id: string) => void;
}) {
  return (
    <ul className="trait-bars" aria-label="Average traits of your lineage">
      {TRAIT_IDS.map((id, i) => {
        const value = means[i];
        const change = previous === undefined ? 0 : value - previous[i];
        const info = TRAIT_INFO[id];
        return (
          <li key={id}>
            <button type="button" className="trait-name" onClick={() => onInfo(id)}>
              {info.label}
              <span className="expressed">{info.expressedIn}</span>
            </button>
            <div
              className="bar"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={Number(value.toFixed(2))}
              aria-label={info.label}
            >
              <div style={{ width: `${Math.max(1, value * 100)}%` }} />
            </div>
            <span className="trait-value">
              {value.toFixed(2)}
              {Math.abs(change) >= 0.01 && (
                <span className={change > 0 ? 'delta up' : 'delta down'}>
                  {change > 0 ? '▲' : '▼'}
                  {Math.abs(change).toFixed(2)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
