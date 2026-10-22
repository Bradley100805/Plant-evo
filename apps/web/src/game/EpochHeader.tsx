import type { EpochReport } from '@plant-evo/sim';
import { FATE_LABEL } from './format.ts';
import type { EpochView } from './protocol.ts';

/** Today's values, for scale. */
const MODERN_CO2 = 420;
const MODERN_O2 = 21;

/** Where the lineage is in time, and what the world is like. */
export function EpochHeader({
  epochs,
  index,
  reports,
}: {
  epochs: EpochView[];
  index: number;
  reports: EpochReport[];
}) {
  const epoch = epochs[Math.min(index, epochs.length - 1)];
  return (
    <header className="epoch-header">
      <Timeline epochs={epochs} index={index} reports={reports} />
      <p className="epoch-kicker">
        Epoch {Math.min(index + 1, epochs.length)} of {epochs.length} · {epoch.ma} million years ago
        · {epoch.period}
      </p>
      <h2>{epoch.title}</h2>
      <p className="epoch-description">{epoch.description}</p>
      <dl className="climate">
        <div>
          <dt>Carbon dioxide</dt>
          <dd>
            {epoch.co2.toLocaleString()} ppm
            <span className="note">{(epoch.co2 / MODERN_CO2).toFixed(1)}× today</span>
          </dd>
        </div>
        <div>
          <dt>Oxygen</dt>
          <dd>
            {epoch.o2}%<span className="note">today {MODERN_O2}%</span>
          </dd>
        </div>
        <div>
          <dt>Mean temperature</dt>
          <dd>
            {epoch.tempC} °C<span className="note">at your pond</span>
          </dd>
        </div>
      </dl>
    </header>
  );
}

function Timeline({
  epochs,
  index,
  reports,
}: {
  epochs: EpochView[];
  index: number;
  reports: EpochReport[];
}) {
  return (
    <div className="timeline">
      <ol aria-label="Epochs of this chapter">
        {epochs.map((e, i) => {
          const report = reports[i];
          const state = i < index ? 'done' : i === index ? 'current' : 'future';
          const label =
            report !== undefined
              ? `${e.ma} Ma, ${e.title}: ${report.extinct ? 'extinct' : FATE_LABEL[report.fate].toLowerCase()}`
              : `${e.ma} Ma, ${e.title}${state === 'current' ? ' (now)' : ''}`;
          return (
            <li
              key={e.ma}
              className={`${state}${report?.extinct ? ' extinct' : ''}`}
              title={label}
              aria-label={label}
              aria-current={state === 'current' ? 'step' : undefined}
            />
          );
        })}
      </ol>
      <div className="timeline-labels" aria-hidden="true">
        <span>{epochs[0].ma} Ma</span>
        <span>{epochs[epochs.length - 1].ma} Ma</span>
      </div>
    </div>
  );
}
