import { useState } from 'react';
import { DriftLab } from './lab/DriftLab.tsx';
import { MutantLab } from './lab/MutantLab.tsx';

const TABS = [
  { id: 'drift', label: 'Genetic drift', Panel: DriftLab },
  { id: 'mutation', label: 'A new mutation', Panel: MutantLab },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [tab, setTab] = useState<TabId>('drift');

  return (
    <div className="page">
      <header className="site-header">
        <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 30V14" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
          <path d="M16 16C16 8 22 4 29 4c0 7-5 12-13 12z" fill="var(--accent)" />
          <path d="M16 20C16 13 11 9 4 9c0 6 5 11 12 11z" fill="var(--series-1)" opacity="0.85" />
        </svg>
        <div>
          <h1>Plant-evo</h1>
          <p className="tagline">The evolution of land plants, simulated from first principles</p>
        </div>
      </header>

      <section className="intro">
        <span className="phase-badge">Phase 1 preview · Population genetics lab</span>
        <p>
          Plant-evo will let you follow plant lineages from freshwater algae to modern grasslands.
          Nothing is scripted: <strong>variation is random and selection decides</strong>. This lab
          runs the engine that will drive every lineage in the game. Each experiment is checked
          against classic population-genetics theory, and every run is seeded, so the same seed
          always gives the same result.
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

      <footer className="site-footer">
        The models, equations and sources behind the simulation are documented in the{' '}
        <a href="https://github.com/Bradley100805/Plant-evo">development plan and Science Bible</a>.
      </footer>
    </div>
  );
}
