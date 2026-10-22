import { useState } from 'react';
import { GameApp } from './game/GameApp.tsx';
import { Lab } from './lab/Lab.tsx';

const SECTIONS = [
  { id: 'play', label: 'Play' },
  { id: 'lab', label: 'Genetics lab' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function App() {
  const [section, setSection] = useState<SectionId>('play');

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
        <nav className="site-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={section === s.id ? 'page' : undefined}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      {/* The game stays mounted while the lab is open so its simulation is not lost. */}
      <main hidden={section !== 'play'}>
        <GameApp />
      </main>
      {section === 'lab' && (
        <main>
          <Lab />
        </main>
      )}

      <footer className="site-footer">
        The models, equations and sources behind the simulation are documented in the{' '}
        <a href="https://github.com/Bradley100805/Plant-evo">development plan and Science Bible</a>.
      </footer>
    </div>
  );
}
