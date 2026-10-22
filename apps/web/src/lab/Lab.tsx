import { useState } from 'react';
import { DriftLab } from './DriftLab.tsx';
import { MutantLab } from './MutantLab.tsx';

const TABS = [
  { id: 'drift', label: 'Genetic drift', Panel: DriftLab },
  { id: 'mutation', label: 'A new mutation', Panel: MutantLab },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Population-genetics experiments that check the engine against classic theory. */
export function Lab() {
  const [tab, setTab] = useState<TabId>('drift');

  return (
    <>
      <section className="intro">
        <p>
          Every lineage in the game runs on the same population-genetics engine. These experiments
          run it on its own: <strong>variation is random and selection decides</strong>. Each one is
          checked against classic theory, and every run is seeded, so the same seed always gives the
          same result.
        </p>
      </section>

      <nav className="tabs" role="tablist" aria-label="Lab experiments">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {TABS.map(({ id, Panel }) => (
        <div
          key={id}
          role="tabpanel"
          id={`panel-${id}`}
          aria-labelledby={`tab-${id}`}
          hidden={tab !== id}
        >
          {tab === id && <Panel />}
        </div>
      ))}
    </>
  );
}
