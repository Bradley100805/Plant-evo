import { type DriftOptions, heterozygosityAfter } from '@plant-evo/sim';
import { useEffect, useMemo, useState } from 'react';
import { LineChart, type LineSeries } from '../charts/LineChart.tsx';
import { ChartCard, DataTable, Legend, StatTile } from '../charts/parts.tsx';
import { downloadCsv, fixed, percent } from './format.ts';
import { summarize, trajectoriesFrom } from './summaries.ts';
import { useExperiment } from './useExperiment.ts';

const SIZES = [10, 25, 50, 100, 250, 1000];
const GENERATIONS = [50, 100, 200, 500];
const REPLICATES = [10, 20, 50, 100];

const defaults: DriftOptions = {
  seed: 'lab',
  size: 50,
  ploidy: 2,
  generations: 200,
  replicates: 50,
  p0: 0.5,
};

export function DriftLab() {
  const [options, setOptions] = useState<DriftOptions>(defaults);
  const [state, run] = useExperiment();
  // Options of the run whose result is shown (the next run may still be computing).
  const ran = state.request?.kind === 'drift' ? state.request.options : defaults;

  const start = (o: DriftOptions) => {
    run({ kind: 'drift', options: o });
  };
  useEffect(() => run({ kind: 'drift', options: defaults }), [run]);

  const view = useMemo(() => {
    if (state.result === null) return null;
    const trajectories = trajectoriesFrom(state.result.table);
    const summary = summarize(trajectories);
    const h0 = summary[0]?.meanDiversity ?? 0;
    const theory = summary.map((s) => heterozygosityAfter(h0, ran.size * ran.ploidy, s.generation));
    return { trajectories, summary, theory };
  }, [state.result, ran]);

  const stale = state.status === 'running';
  const set = <K extends keyof DriftOptions>(key: K, value: DriftOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  return (
    <div className="lab">
      <h2>Genetic drift</h2>
      <p className="lede">
        Many populations start with the same allele at the same frequency and no selection at all.
        Chance alone, through which individuals happen to leave offspring, pushes each population's
        frequency up or down until the allele is fixed or lost.
      </p>

      <form
        className="controls"
        onSubmit={(e) => {
          e.preventDefault();
          start(options);
        }}
      >
        <label className="control">
          Population size (N)
          <select value={options.size} onChange={(e) => set('size', Number(e.target.value))}>
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>
            Starting frequency <span className="value">{options.p0.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.05}
            value={options.p0}
            onChange={(e) => set('p0', Number(e.target.value))}
          />
        </label>
        <label className="control">
          Generations
          <select
            value={options.generations}
            onChange={(e) => set('generations', Number(e.target.value))}
          >
            {GENERATIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          Populations
          <select
            value={options.replicates}
            onChange={(e) => set('replicates', Number(e.target.value))}
          >
            {REPLICATES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          Seed
          <input value={String(options.seed)} onChange={(e) => set('seed', e.target.value)} />
        </label>
        <button className="run-button" type="submit" disabled={stale}>
          {stale ? 'Running…' : 'Run'}
        </button>
      </form>
      {stale && (
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={Math.round(state.progress * 100)}
        >
          <div style={{ width: `${state.progress * 100}%` }} />
        </div>
      )}
      {state.error !== null && <p className="error">Simulation failed: {state.error}</p>}

      {view !== null && state.result !== null && (
        <>
          <div className="tiles">
            <StatTile
              label="Fixed (frequency 1)"
              value={`${state.result.summary.fixed} of ${ran.replicates}`}
              note={`Theory: each fixes with probability ${fixed(state.result.summary.expected_fixation_probability, 2)}`}
            />
            <StatTile
              label="Lost (frequency 0)"
              value={`${state.result.summary.lost} of ${ran.replicates}`}
            />
            <StatTile
              label="Still variable"
              value={`${state.result.summary.segregating} of ${ran.replicates}`}
              note={`after ${ran.generations} generations`}
            />
            <StatTile
              label="Simulated in"
              value={`${Math.max(1, Math.round(state.elapsedMs))} ms`}
              note="in a background worker"
            />
          </div>

          <div className="charts">
            <ChartCard
              title="Allele frequency in each population"
              subtitle={`${ran.replicates} populations of ${ran.size} diploid individuals, no selection`}
              stale={stale}
            >
              <LineChart
                series={view.trajectories.map<LineSeries>((t) => ({
                  id: String(t.replicate),
                  values: t.values,
                  color: 'var(--series-1)',
                  // Fade lines as their number grows so overlaps still read as density.
                  opacity: Math.max(0.25, Math.min(0.6, 15 / ran.replicates)),
                }))}
                xMax={ran.generations}
                yDomain={[0, 1]}
                xLabel="Generation"
                yLabel="Allele frequency"
                ariaLabel={`Allele frequency trajectories for ${ran.replicates} populations over ${ran.generations} generations. ${state.result.summary.fixed} fixed, ${state.result.summary.lost} lost.`}
                tooltip={(g) => {
                  const s = view.summary[g];
                  return {
                    title: `Generation ${g}`,
                    rows: [
                      { label: 'Mean frequency', value: fixed(s.meanFrequency) },
                      { label: 'Fixed', value: String(s.fixed) },
                      { label: 'Lost', value: String(s.lost) },
                      { label: 'Still variable', value: String(s.segregating) },
                    ],
                  };
                }}
              />
            </ChartCard>

            <ChartCard
              title="Genetic diversity: simulation vs. theory"
              subtitle="Mean gene diversity 2p(1 − p) across populations"
              stale={stale}
            >
              <Legend
                items={[
                  { label: 'Simulated (mean of all populations)', color: 'var(--series-1)' },
                  { label: 'Theory: H₀(1 − 1/2N)ᵗ', color: 'var(--series-2)' },
                ]}
              />
              <LineChart
                series={[
                  {
                    id: 'sim',
                    values: view.summary.map((s) => s.meanDiversity),
                    color: 'var(--series-1)',
                    marker: true,
                    endLabel: 'Simulated',
                  },
                  {
                    id: 'theory',
                    values: view.theory,
                    color: 'var(--series-2)',
                    marker: true,
                    endLabel: 'Theory',
                  },
                ]}
                xMax={ran.generations}
                yDomain={[0, 0.5]}
                xLabel="Generation"
                yLabel="Gene diversity"
                ariaLabel="Mean gene diversity over time compared with the theoretical decay H0(1 − 1/2N)^t."
                tooltip={(g) => ({
                  title: `Generation ${g}`,
                  rows: [
                    {
                      label: 'Simulated',
                      value: fixed(view.summary[g].meanDiversity),
                      color: 'var(--series-1)',
                    },
                    { label: 'Theory', value: fixed(view.theory[g]), color: 'var(--series-2)' },
                  ],
                })}
              />
            </ChartCard>
          </div>

          <div className="explain">
            <h4>What to look for</h4>
            <p>
              Smaller populations drift faster: try N = 10 and then N = 1000. Diversity falls by a
              factor of (1 − 1/2N) each generation on average, so the blue curve should track the
              orange one. With few populations the average is noisy, so expect the blue curve to
              wander; more populations bring it closer to theory. Each population fixes the allele
              with probability equal to its starting frequency, here {percent(options.p0, 0)}.
            </p>
            <p>
              In the game, drift is why small, isolated populations can lose useful variation, or
              fix a harmful variant, regardless of what selection would favour.
            </p>
          </div>

          <details className="data">
            <summary>Show data table</summary>
            <button
              type="button"
              className="link-button"
              onClick={() => downloadCsv(`drift-${String(ran.seed)}.csv`, state.result!.table)}
            >
              Download full CSV
            </button>
            <DataTable
              columns={[
                'Generation',
                'Mean frequency',
                'Fixed',
                'Lost',
                'Variable',
                'Diversity',
                'Theory',
              ]}
              rows={view.summary.map((s, g) => [
                s.generation,
                fixed(s.meanFrequency),
                s.fixed,
                s.lost,
                s.segregating,
                fixed(s.meanDiversity),
                fixed(view.theory[g]),
              ])}
            />
          </details>
        </>
      )}
    </div>
  );
}
