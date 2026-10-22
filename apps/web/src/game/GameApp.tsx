import { classifyGrade, traitRecord } from '@plant-evo/morph';
import {
  type EpochReport,
  type GameSnapshot,
  LEAVING_THE_WATER,
  TRAIT_IDS,
  TRAIT_INFO,
} from '@plant-evo/sim';
import { useEffect, useState } from 'react';
import { ChapterSummary } from './ChapterEnd.tsx';
import { CodexDialog } from './CodexDialog.tsx';
import { DraftPanel } from './DraftPanel.tsx';
import { EpochHeader } from './EpochHeader.tsx';
import { GoalsPanel } from './GoalsPanel.tsx';
import { LandscapeMap, type Overlay } from './LandscapeMap.tsx';
import { PlantPortrait } from './PlantPortrait.tsx';
import type { GameView } from './protocol.ts';
import { ReportPanel } from './ReportPanel.tsx';
import { AUTOSAVE, readSave, type SaveInfo, saveInfo, writeSave } from './saves.ts';
import { TitleScreen } from './TitleScreen.tsx';
import { TraitBars } from './TraitBars.tsx';
import { useGame } from './useGame.ts';

const SCENARIO = LEAVING_THE_WATER;

/** Lineage mode for chapter 1: title screen, Mutation Draft, epoch reports and the ending. */
export function GameApp() {
  const [state, controls] = useGame(SCENARIO.id);
  const { view, busy, progress, error } = state;
  const [screen, setScreen] = useState<'title' | 'game'>('title');
  const [autosave, setAutosave] = useState<SaveInfo | null>(null);
  // Reports the player has already read; a newer report is shown before the next draft.
  const [seen, setSeen] = useState(0);
  const [codex, setCodex] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>('plants');
  // The game as it stood at the start of the current epoch, for going back after an extinction.
  const [checkpoint, setCheckpoint] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    void saveInfo(AUTOSAVE).then(setAutosave);
  }, []);

  // Autosave whenever the game changes.
  useEffect(() => {
    if (view === null) return;
    let cancelled = false;
    void controls.save().then(async (snapshot) => {
      if (!cancelled && snapshot.phase === 'draft') setCheckpoint(snapshot);
      const info = {
        title: view.title,
        seed: view.seed,
        pure: view.pure,
        phase: view.phase,
        epochIndex: view.epochIndex,
        ma: view.epochs[Math.min(view.epochIndex, view.epochs.length - 1)].ma,
      };
      if ((await writeSave(AUTOSAVE, info, snapshot)) && !cancelled) {
        setAutosave({ ...info, slot: AUTOSAVE, savedAt: Date.now() });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [view, controls]);

  const reportCount = view?.reports.length ?? 0;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [reportCount, screen]);

  const startNew = (seed: string, pure: boolean) => {
    setCheckpoint(null);
    setSeen(0);
    setScreen('game');
    controls.newGame(seed, pure);
  };

  const load = (snapshot: GameSnapshot) => {
    setSeen(snapshot.reports.length);
    setScreen('game');
    controls.load(snapshot);
  };

  const continueAutosave = () => {
    void readSave(AUTOSAVE).then((snapshot) => {
      if (snapshot !== null) load(snapshot);
    });
  };

  const codexDialog = (
    <CodexDialog entryId={codex} onSelect={setCodex} onClose={() => setCodex(null)} />
  );

  if (screen === 'title') {
    return (
      <>
        <TitleScreen
          scenario={SCENARIO}
          autosave={autosave}
          busy={busy}
          onNew={startNew}
          onContinue={continueAutosave}
          onInfo={setCodex}
        />
        {codexDialog}
      </>
    );
  }

  const toolbar = (
    <div className="game-toolbar">
      <span className="note">
        {SCENARIO.title}
        {view !== null && ` · ${view.pure ? 'Pure' : 'Lineage'} mode · seed “${view.seed}”`}
      </span>
      <div className="toolbar-actions">
        <button type="button" className="secondary-button" onClick={() => setCodex('model')}>
          Codex
        </button>
        <button type="button" className="secondary-button" onClick={() => setScreen('title')}>
          Main menu
        </button>
      </div>
    </div>
  );

  if (view === null) {
    return (
      <div className="game">
        {toolbar}
        {error !== null ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <div className="running" aria-live="polite">
            <h3>Preparing the pond…</h3>
            <p className="note">Founding a population of algae and letting it settle.</p>
          </div>
        )}
        {codexDialog}
      </div>
    );
  }

  const last = view.reports[view.reports.length - 1];
  const showReport = last !== undefined && view.reports.length > seen;
  let body;
  if (view.phase === 'extinct' && last !== undefined) {
    body = (
      <Extinction
        view={view}
        report={last}
        canRewind={!view.pure && checkpoint !== null}
        onRewind={() => checkpoint !== null && load(checkpoint)}
        onNew={() => setScreen('title')}
        onInfo={setCodex}
      />
    );
  } else if (showReport) {
    body = (
      <ReportScreen
        view={view}
        report={last}
        overlay={overlay}
        onOverlay={setOverlay}
        onContinue={() => setSeen(view.reports.length)}
        onInfo={setCodex}
      />
    );
  } else if (view.phase === 'complete') {
    body = <ChapterComplete view={view} onNew={() => setScreen('title')} />;
  } else {
    body = (
      <>
        <EpochHeader epochs={view.epochs} index={view.epochIndex} reports={view.reports} />
        <div className="game-grid">
          <div className="main-col">
            {busy ? (
              <Running progress={progress} generations={view.generationsPerEpoch} />
            ) : (
              <DraftPanel
                offers={view.offers}
                pure={view.pure}
                natureChoice={view.natureChoice}
                generations={view.generationsPerEpoch}
                disabled={busy}
                onChoose={controls.run}
                onInfo={setCodex}
              />
            )}
            <MapCard view={view} overlay={overlay} onOverlay={setOverlay} stale={busy} />
          </div>
          <div className="side-col">
            <LineageCard view={view} previous={last?.traitStart} onInfo={setCodex} />
            <GoalsPanel goals={view.goals} epochs={view.epochs} />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="game">
      {toolbar}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {body}
      {codexDialog}
    </div>
  );
}

function Running({ progress, generations }: { progress: number; generations: number }) {
  const done = Math.round(progress * generations);
  return (
    <section className="running" aria-live="polite" aria-busy="true">
      <h3>Simulating {generations} generations…</h3>
      <div
        className="progress big"
        role="progressbar"
        aria-label="Simulation progress"
        aria-valuemin={0}
        aria-valuemax={generations}
        aria-valuenow={done}
      >
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="note">
        Generation {done} of {generations}. Month by month, every plant photosynthesises, gains and
        loses water, is fertilised or not, and releases spores that compete for space.
      </p>
    </section>
  );
}

function MapCard({
  view,
  overlay,
  onOverlay,
  stale = false,
}: {
  view: GameView;
  overlay: Overlay;
  onOverlay: (o: Overlay) => void;
  stale?: boolean;
}) {
  return (
    <section className={stale ? 'card stale' : 'card'} aria-labelledby="map-title">
      <div className="card-head">
        <div>
          <h3 id="map-title">Your pond margin</h3>
          <p className="subtitle">
            Last year of the latest epoch. Each square is a {view.map.cellSize * 100} cm patch.
          </p>
        </div>
        <label className="control">
          Show
          <select value={overlay} onChange={(e) => onOverlay(e.target.value as Overlay)}>
            <option value="plants">Plants</option>
            <option value="height">Sporophyte height</option>
            {TRAIT_IDS.map((id) => (
              <option key={id} value={id}>
                {TRAIT_INFO[id].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <LandscapeMap map={view.map} overlay={overlay} />
    </section>
  );
}

function LineageCard({
  view,
  previous,
  onInfo,
}: {
  view: GameView;
  previous?: number[];
  onInfo: (id: string) => void;
}) {
  return (
    <section className="card lineage" aria-labelledby="lineage-title">
      <h3 id="lineage-title">Your typical plant</h3>
      <PlantPortrait
        traits={view.traitMeans}
        height={view.sporophyteHeight}
        aquatic={view.aquatic}
        seed={view.seed}
      />
      <TraitBars means={view.traitMeans} previous={previous} onInfo={onInfo} />
    </section>
  );
}

function ReportScreen({
  view,
  report,
  overlay,
  onOverlay,
  onContinue,
  onInfo,
}: {
  view: GameView;
  report: EpochReport;
  overlay: Overlay;
  onOverlay: (o: Overlay) => void;
  onContinue: () => void;
  onInfo: (id: string) => void;
}) {
  const epoch = view.epochs[report.epochIndex];
  const next = view.phase === 'draft' ? view.epochs[view.epochIndex] : null;
  const label = next !== null ? `Continue to ${next.ma} million years ago` : 'See how it ended';
  return (
    <section className="report-screen" aria-labelledby="report-title">
      <header className="report-header">
        <div>
          <p className="epoch-kicker">
            Epoch {report.epochIndex + 1} of {view.epochs.length} · {epoch.ma} million years ago ·
            results
          </p>
          <h2 id="report-title">{epoch.title}</h2>
        </div>
        <button type="button" className="run-button" onClick={onContinue}>
          {label}
        </button>
      </header>
      <ReportPanel
        report={report}
        epoch={epoch}
        goals={view.goals}
        onInfo={onInfo}
        aside={
          <section className="card lineage">
            <h3>Your typical plant now</h3>
            <PlantPortrait
              traits={view.traitMeans}
              height={view.sporophyteHeight}
              aquatic={view.aquatic}
              seed={view.seed}
            />
          </section>
        }
      />
      <div className="map-row">
        <MapCard view={view} overlay={overlay} onOverlay={onOverlay} />
      </div>
      <div className="continue-row">
        <button type="button" className="run-button" onClick={onContinue}>
          {next !== null ? `${label}: ${next.title}` : label}
        </button>
      </div>
    </section>
  );
}

function Extinction({
  view,
  report,
  canRewind,
  onRewind,
  onNew,
  onInfo,
}: {
  view: GameView;
  report: EpochReport;
  canRewind: boolean;
  onRewind: () => void;
  onNew: () => void;
  onInfo: (id: string) => void;
}) {
  const epoch = view.epochs[report.epochIndex];
  return (
    <section className="ending" aria-labelledby="ending-title">
      <p className="epoch-kicker">
        Epoch {report.epochIndex + 1} · {epoch.ma} million years ago · {epoch.title}
      </p>
      <h2 id="ending-title">Your lineage is extinct</h2>
      <p className="ending-lede">
        Almost every lineage that has ever lived is extinct, and this one has joined them. The
        causes of death below show what the last plants could not survive.
      </p>
      <div className="ending-actions">
        {canRewind && (
          <button type="button" className="run-button" onClick={onRewind}>
            Go back to the start of this epoch
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onNew}>
          Start a new lineage
        </button>
      </div>
      <ReportPanel report={report} epoch={epoch} goals={view.goals} onInfo={onInfo} />
      <ChapterSummary view={view} />
    </section>
  );
}

function ChapterComplete({ view, onNew }: { view: GameView; onNew: () => void }) {
  const grade = classifyGrade(traitRecord(view.traitMeans));
  const reached = view.goals.filter((g) => g.achievedIn !== null).length;
  const first = view.epochs[0];
  const final = view.epochs[view.epochs.length - 1];
  return (
    <section className="ending" aria-labelledby="ending-title">
      <p className="epoch-kicker">{view.subtitle}</p>
      <h2 id="ending-title">Chapter complete</h2>
      <p className="ending-lede">
        Your lineage lived through {view.epochs.length} epochs, from {first.ma} to {final.ma}{' '}
        million years ago. It ends the chapter as {article(grade)} {grade}, having reached {reached}{' '}
        of {view.goals.length} milestones. Compare its history with what real plants did below.
      </p>
      <div className="ending-actions">
        <button type="button" className="run-button" onClick={onNew}>
          Start a new lineage
        </button>
      </div>
      <div className="game-grid">
        <div className="main-col">
          <ChapterSummary view={view} />
        </div>
        <div className="side-col">
          <section className="card lineage">
            <h3>Your plant at the end of the chapter</h3>
            <PlantPortrait
              traits={view.traitMeans}
              height={view.sporophyteHeight}
              aquatic={view.aquatic}
              seed={view.seed}
            />
          </section>
        </div>
      </div>
    </section>
  );
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}
