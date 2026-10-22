import type { Scenario } from '@plant-evo/sim';
import { type FormEvent, useState } from 'react';
import { randomSeed } from './format.ts';
import type { SaveInfo } from './saves.ts';

/** Chapter introduction: start a new game or continue the autosave. */
export function TitleScreen({
  scenario,
  autosave,
  busy,
  onNew,
  onContinue,
  onInfo,
}: {
  scenario: Scenario;
  autosave: SaveInfo | null;
  busy: boolean;
  onNew: (seed: string, pure: boolean) => void;
  onContinue: () => void;
  onInfo: (id: string) => void;
}) {
  const [seed, setSeed] = useState(randomSeed);
  const [pure, setPure] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onNew(seed.trim() || randomSeed(), pure);
  };

  return (
    <section className="title-screen" aria-labelledby="chapter-title">
      <p className="kicker">{scenario.subtitle}</p>
      <h2 id="chapter-title">{scenario.title}</h2>
      {scenario.intro.map((p, i) => (
        <p key={i} className="intro-text">
          {p}
        </p>
      ))}

      {autosave !== null && (
        <div className="continue-card">
          <div>
            <strong>Continue your lineage</strong>
            <span className="note">
              {autosave.phase === 'complete'
                ? 'Chapter complete'
                : autosave.phase === 'extinct'
                  ? 'Extinct'
                  : `Epoch ${autosave.epochIndex + 1} of ${scenario.epochs.length}, ${autosave.ma} million years ago`}
              {' · '}
              {autosave.pure ? 'Pure mode' : 'Lineage mode'} · seed “{autosave.seed}”
            </span>
          </div>
          <button type="button" className="run-button" disabled={busy} onClick={onContinue}>
            Continue
          </button>
        </div>
      )}

      <form className="new-game" onSubmit={submit}>
        <fieldset>
          <legend>Mode</legend>
          <label className={pure ? 'mode' : 'mode selected'}>
            <input type="radio" name="mode" checked={!pure} onChange={() => setPure(false)} />
            <span>
              <strong>Lineage</strong>
              Each epoch, choose which random mutation to follow.
            </span>
          </label>
          <label className={pure ? 'mode selected' : 'mode'}>
            <input type="radio" name="mode" checked={pure} onChange={() => setPure(true)} />
            <span>
              <strong>Pure</strong>
              Nature picks at random. Watch evolution with no one steering.
            </span>
          </label>
        </fieldset>
        <div className="seed-row">
          <label className="control">
            World seed
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <button type="button" className="secondary-button" onClick={() => setSeed(randomSeed())}>
            New seed
          </button>
          <button type="submit" className="run-button" disabled={busy}>
            {busy ? 'Preparing the pond…' : 'Start a new lineage'}
          </button>
        </div>
        <p className="note">
          The same seed and the same choices always give the same history.{' '}
          <button type="button" className="link-button inline" onClick={() => onInfo('model')}>
            How the simulation works
          </button>
        </p>
      </form>
    </section>
  );
}
