import { DEATH_CAUSES, type EpochReport, ZONES } from '@plant-evo/sim';
import { type ReactNode, useMemo } from 'react';
import { LineChart, type LineSeries } from '../charts/LineChart.tsx';
import { ChartCard, DataTable, Legend, StatTile } from '../charts/parts.tsx';
import { capitalise, fateText, formatHeight, geneName } from './format.ts';
import type { EpochView, GoalView } from './protocol.ts';
import { TraitBars } from './TraitBars.tsx';

/** Zone series take the categorical slots in fixed order, wettest first. */
const ZONE_COLOURS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
];

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** What happened during one epoch: the mutation's fate, where plants reproduced, and why they died. */
export function ReportPanel({
  report,
  epoch,
  goals,
  onInfo,
  aside,
}: {
  report: EpochReport;
  epoch: EpochView;
  goals: GoalView[];
  onInfo: (id: string) => void;
  /** Shown beside the trait changes (e.g. the plant's portrait). */
  aside?: ReactNode;
}) {
  const last = report.series[report.series.length - 1];
  const recent = report.series.slice(-10);
  const height = recent.reduce((s, p) => s + p.sporophyteHeight, 0) / (recent.length || 1);
  const reached = goals.filter((g) => report.goalsAchieved.includes(g.id));
  const xMax = Math.max(1, report.series.length - 1);

  const frequency = useMemo<LineSeries[]>(
    () => [
      {
        id: 'frequency',
        values: report.series.map((p) => 100 * p.variantFrequency),
        color: 'var(--series-1)',
        marker: true,
      },
    ],
    [report],
  );

  const reproduction = useMemo(() => {
    const series = ZONES.map<LineSeries>((zone, z) => {
      const cells = report.zones[z].cells;
      return {
        id: zone,
        values: report.series.map((p) => (cells > 0 ? (100 * p.reproduced[z]) / cells : 0)),
        color: ZONE_COLOURS[z],
        marker: true,
        endLabel: capitalise(zone),
      };
    });
    let max = 0;
    for (const s of series) for (const v of Array.from(s.values)) max = Math.max(max, v);
    return { series, yMax: Math.min(100, Math.max(10, Math.ceil(max / 10) * 10)) };
  }, [report]);

  return (
    <div className="report">
      <p className="fate">{fateText(report)}</p>
      {report.extinct && (
        <p className="fate extinct">
          The last of your plants died in generation {report.series.length} of this epoch.
        </p>
      )}

      <div className="tiles">
        <StatTile
          label="Plants alive"
          value={(last?.population ?? 0).toLocaleString()}
          note="patches occupied at the end of the epoch"
        />
        {report.chosen !== null && (
          <StatTile
            label="Carry the mutation"
            value={`${Math.round(report.variantFrequency * 100)}%`}
            note={geneName(report.chosen)}
          />
        )}
        <StatTile
          label="Sporophyte height"
          value={formatHeight(height)}
          note="average over the last 10 generations"
        />
        <StatTile
          label="Goals reached"
          value={String(reached.length)}
          note={reached.length > 0 ? reached.map((g) => g.title).join(', ') : 'this epoch'}
        />
      </div>

      <div className="charts two">
        {report.chosen !== null && (
          <ChartCard
            title="Plants carrying the mutation"
            subtitle={`${geneName(report.chosen)}, arising ${report.origins} times in single plants`}
          >
            <LineChart
              series={frequency}
              xMax={xMax}
              yDomain={[0, 100]}
              xLabel="Generation in this epoch"
              yLabel="% of plants"
              ariaLabel={`Share of plants carrying the mutation over ${report.series.length} generations. ${fateText(report)}`}
              height={220}
              tooltip={(x) => ({
                title: `Generation ${x + 1}`,
                rows: [{ label: 'Carry it', value: `${frequency[0].values[x].toFixed(1)}%` }],
              })}
            />
            <button type="button" className="link-button" onClick={() => onInfo('drift')}>
              Why are most new mutations lost?
            </button>
          </ChartCard>
        )}
        <ChartCard
          title="Where plants reproduced"
          subtitle="Share of each zone’s patches holding a plant that released spores"
        >
          <Legend
            items={ZONES.map((zone, z) => ({ label: capitalise(zone), color: ZONE_COLOURS[z] }))}
          />
          <LineChart
            series={reproduction.series}
            xMax={xMax}
            yDomain={[0, reproduction.yMax]}
            xLabel="Generation in this epoch"
            yLabel="% of patches"
            ariaLabel="Share of patches in each zone where plants reproduced, by generation. The table below lists the values."
            height={220}
            tooltip={(x) => ({
              title: `Generation ${x + 1}`,
              rows: reproduction.series.map((s, z) => ({
                label: capitalise(ZONES[z]),
                value: `${s.values[x].toFixed(1)}%`,
                color: s.color,
              })),
            })}
          />
        </ChartCard>
      </div>

      <div className="report-grid">
        <ChartCard
          title="How your lineage changed"
          subtitle="Average traits at the end of the epoch"
        >
          <TraitBars means={report.traitEnd} previous={report.traitStart} onInfo={onInfo} />
        </ChartCard>
        {aside}
      </div>

      <ChartCard
        title="Life in each zone"
        subtitle="Patches, reproduction, spores and height are yearly averages over the last 10 generations; deaths are totals over those years"
      >
        <DataTable
          columns={[
            'Zone',
            'Patches',
            'Reproduced',
            'Spores each',
            'Height',
            ...DEATH_CAUSES.map((cause) => `Deaths: ${cause}`),
          ]}
          rows={ZONES.map((zone, z) => {
            const s = report.zones[z];
            return [
              capitalise(zone),
              s.cells,
              s.cells > 0 ? `${((100 * s.reproduced) / s.cells).toFixed(0)}%` : '—',
              s.reproduced > 0 ? compact.format(s.sporesPerReproducer) : '—',
              formatHeight(s.sporophyteHeight),
              ...s.deaths.map((d) => d.toLocaleString()),
            ];
          })}
        />
      </ChartCard>

      {epoch.fossilRecord !== null && (
        <aside className="fossil-note">
          <h4>Meanwhile, in the fossil record</h4>
          <p>{epoch.fossilRecord}</p>
        </aside>
      )}
    </div>
  );
}
