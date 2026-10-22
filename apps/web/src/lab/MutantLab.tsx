import type { SweepOptions } from '@plant-evo/sim';
import { useEffect, useMemo, useState } from 'react';
import { LineChart, type LineSeries } from '../charts/LineChart.tsx';
import { ChartCard, DataTable, Legend, StatTile } from '../charts/parts.tsx';
import { downloadCsv, percent } from './format.ts';
import { outcomeOf, summarize, trajectoriesFrom } from './summaries.ts';
import { useExperiment } from './useExperiment.ts';

const SIZES = [50, 100, 250, 500, 1000];
const REPLICATES = [50, 100, 200, 500, 1000];
const DOMINANCE = [
  { value: 0, label: 'Recessive (h = 0)' },
  { value: 0.5, label: 'Additive (h = 0.5)' },
  { value: 1, label: 'Dominant (h = 1)' },
];

const defaults: SweepOptions = {
  seed: 'lab',
  size: 100,
  ploidy: 2,
  s: 0.05,
  h: 0.5,
  replicates: 200,
  maxGenerations: 20_000,
};

export function MutantLab() {
  const [options, setOptions] = useState<SweepOptions>(defaults);
  const [state, run] = useExperiment();
  const [ran, setRan] = useState<SweepOptions>(defaults);

  const start = (o: SweepOptions) => {
    setRan(o);
    run({ kind: 'sweep', options: o });
  };
  useEffect(() => run({ kind: 'sweep', options: defaults }), [run]);

  const view = useMemo(() => {
    if (state.result === null) return null;
    const trajectories = trajectoriesFrom(state.result.table);
    const outcomes = trajectories.map(outcomeOf);
    const summary = summarize(trajectories);
    const xMax = Math.max(1, summary.length - 1);
    // Draw lost lines first so the fixed ones sit on top.
    const order = trajectories
      .map((t, i) => ({ t, outcome: outcomes[i] }))
      .sort((a, b) => Number(a.outcome === 'fixed') - Number(b.outcome === 'fixed'));
    const series = order.map<LineSeries>(({ t, outcome }) =>
      outcome === 'fixed'
        ? { id: String(t.replicate), values: t.values, color: 'var(--series-1)', opacity: 0.85 }
        : {
            id: String(t.replicate),
            values: t.values,
            color: 'var(--series-muted)',
            width: 1.5,
            opacity: 0.3,
          },
    );
    return { trajectories, outcomes, summary, xMax, series };
  }, [state.result]);

  const stale = state.status === 'running';
  const set = <K extends keyof SweepOptions>(key: K, value: SweepOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));
  const summary = state.result?.summary;

  return (
    <div className="lab">
      <h2>A new mutation</h2>
      <p className="lede">
        A single copy of a new variant appears in one individual, just as a pick from the Mutation
        Draft will. Does it spread? Each run follows the variant until it is fixed in every
        individual or lost from the population.
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
            Selection coefficient s <span className="value">{options.s.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={-0.05}
            max={0.2}
            step={0.01}
            value={options.s}
            onChange={(e) => set('s', Number(e.target.value))}
          />
        </label>
        <label className="control">
          Dominance
          <select value={options.h} onChange={(e) => set('h', Number(e.target.value))}>
            {DOMINANCE.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          New mutations
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

      {view !== null && summary !== undefined && (
        <>
          <div className="tiles">
            <StatTile
              label="Fixed"
              value={percent(summary.fixation_rate)}
              note={`${summary.fixed} of ${summary.replicates} new mutations`}
            />
            <StatTile
              label="Theory (Kimura 1962)"
              value={percent(summary.expected_fixation_probability)}
              note="diffusion approximation"
            />
            <StatTile
              label="If it were neutral"
              value={percent(summary.neutral_fixation_probability)}
              note="1 / 2N"
            />
            <StatTile
              label="Time to fixation"
              value={
                Number.isFinite(summary.mean_fixation_time)
                  ? `${Math.round(summary.mean_fixation_time)} gen.`
                  : '—'
              }
              note="mean, when it fixed"
            />
          </div>

          <div className="charts">
            <ChartCard
              title="Frequency of the new mutation"
              subtitle={`${ran.replicates} independent mutations, s = ${ran.s}, N = ${ran.size}`}
              stale={stale}
            >
              <Legend
                items={[
                  { label: `Fixed (${summary.fixed})`, color: 'var(--series-1)' },
                  { label: `Lost (${summary.lost})`, color: 'var(--series-muted)' },
                ]}
              />
              <LineChart
                series={view.series}
                xMax={view.xMax}
                yDomain={[0, 1]}
                xLabel="Generation"
                yLabel="Mutation frequency"
                ariaLabel={`Frequency trajectories of ${ran.replicates} new mutations. ${summary.fixed} fixed and ${summary.lost} were lost.`}
                tooltip={(g) => {
                  const s = view.summary[g];
                  return {
                    title: `Generation ${g}`,
                    rows: [
                      { label: 'Fixed so far', value: String(s.fixed), color: 'var(--series-1)' },
                      { label: 'Lost so far', value: String(s.lost), color: 'var(--series-muted)' },
                      { label: 'Still spreading', value: String(s.segregating) },
                    ],
                  };
                }}
              />
            </ChartCard>
          </div>

          <div className="explain">
            <h4>What to look for</h4>
            <p>
              Even a clearly beneficial mutation is usually lost. While it exists in only one or two
              copies, whether its carriers happen to reproduce matters far more than its small
              advantage. Theory predicts a fixation probability of only about 2 × (advantage per
              copy) for an additive mutation, so roughly{' '}
              {percent(summary.expected_fixation_probability, 0)} here.
            </p>
            <p>
              Try a recessive mutation: rare copies sit almost entirely in heterozygotes, where
              selection cannot see them. In the game, this is why a variant you pick in the Mutation
              Draft is never guaranteed to spread.
            </p>
          </div>

          <details className="data">
            <summary>Show data table</summary>
            <button
              type="button"
              className="link-button"
              onClick={() =>
                downloadCsv(`new-mutation-${String(ran.seed)}.csv`, state.result!.table)
              }
            >
              Download full CSV
            </button>
            <DataTable
              columns={['Mutation', 'Outcome', 'Generations followed', 'Peak frequency']}
              rows={view.trajectories.map((t, i) => [
                t.replicate + 1,
                view.outcomes[i],
                t.values.length - 1,
                Math.max(...t.values).toFixed(3),
              ])}
            />
          </details>
        </>
      )}
    </div>
  );
}
