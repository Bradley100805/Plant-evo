import { type EpochReport, T, TRAIT_IDS, TRAIT_INFO, type TraitId } from '@plant-evo/sim';
import { useMemo } from 'react';
import { LineChart, type LineSeries } from '../charts/LineChart.tsx';
import { ChartCard, DataTable, Legend } from '../charts/parts.tsx';
import { FATE_LABEL, geneName } from './format.ts';
import type { EpochView, GameView } from './protocol.ts';

/** Traits followed across the whole chapter, in categorical slot order. */
const KEY_TRAITS: TraitId[] = ['sporophyte', 'cuticle', 'vascular', 'stature'];
const KEY_COLOURS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

/** The lineage's history compared with the real fossil record. */
export function ChapterSummary({ view }: { view: GameView }) {
  return (
    <>
      <GoalsComparison view={view} />
      <TraitHistory reports={view.reports} epochs={view.epochs} />
      <Story reports={view.reports} epochs={view.epochs} />
    </>
  );
}

function GoalsComparison({ view }: { view: GameView }) {
  return (
    <ChartCard title="Your lineage and real history" subtitle="When each milestone was reached">
      <DataTable
        className="text"
        columns={['Milestone', 'Your lineage', 'Real plants']}
        rows={view.goals.map((g) => [
          g.title,
          g.achievedIn === null
            ? 'Not reached'
            : `${view.epochs[g.achievedIn].ma} million years ago`,
          g.realHistory,
        ])}
      />
    </ChartCard>
  );
}

function TraitHistory({ reports, epochs }: { reports: EpochReport[]; epochs: EpochView[] }) {
  const { series, epochOf } = useMemo(() => {
    const points = reports.flatMap((r) => r.series.map((p) => ({ epoch: r.epochIndex, p })));
    return {
      series: KEY_TRAITS.map<LineSeries>((id, k) => ({
        id,
        values: points.map(({ p }) => p.traitMeans[T[id]]),
        color: KEY_COLOURS[k],
        marker: true,
        endLabel: TRAIT_INFO[id].label,
      })),
      epochOf: points.map(({ epoch }) => epoch),
    };
  }, [reports]);
  const xMax = Math.max(1, epochOf.length - 1);
  return (
    <ChartCard
      title="How your lineage changed"
      subtitle="Average trait values, generation by generation, across the chapter"
    >
      <Legend
        items={KEY_TRAITS.map((id, k) => ({ label: TRAIT_INFO[id].label, color: KEY_COLOURS[k] }))}
      />
      <LineChart
        series={series}
        xMax={xMax}
        yDomain={[0, 1]}
        xLabel="Generations since the start of the chapter"
        yLabel="Average trait value"
        ariaLabel="Average values of four key traits across the chapter. The table below lists every trait at the end of each epoch."
        tooltip={(x) => ({
          title: `Generation ${x + 1} · ${epochs[epochOf[x]].ma} million years ago`,
          rows: series.map((s, k) => ({
            label: TRAIT_INFO[KEY_TRAITS[k]].label,
            value: s.values[x].toFixed(2),
            color: s.color,
          })),
        })}
      />
      <details className="data">
        <summary>All traits at the end of each epoch</summary>
        <DataTable
          columns={['Ma', ...TRAIT_IDS.map((id) => TRAIT_INFO[id].label)]}
          rows={reports.map((r) => [r.ma, ...r.traitEnd.map((v) => v.toFixed(2))])}
        />
      </details>
    </ChartCard>
  );
}

function Story({ reports, epochs }: { reports: EpochReport[]; epochs: EpochView[] }) {
  return (
    <ChartCard title="Your lineage’s story" subtitle="The mutation you followed in each epoch">
      <DataTable
        className="text"
        columns={['Ma', 'Epoch', 'Mutation', 'Fate', 'Plants alive']}
        rows={reports.map((r) => [
          r.ma,
          epochs[r.epochIndex].title,
          r.chosen === null ? '—' : geneName(r.chosen),
          r.extinct ? 'Extinct' : FATE_LABEL[r.fate],
          (r.series[r.series.length - 1]?.population ?? 0).toLocaleString(),
        ])}
      />
    </ChartCard>
  );
}
