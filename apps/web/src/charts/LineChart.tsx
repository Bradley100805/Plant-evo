import { type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react';
import { formatTick, linear, niceTicks } from './scale.ts';
import { useElementWidth } from './useElementWidth.ts';

export interface LineSeries {
  id: string;
  /** y value at each x = 0, 1, 2, ... */
  values: ArrayLike<number>;
  /** CSS color, e.g. 'var(--series-1)'. */
  color: string;
  width?: number;
  opacity?: number;
  /** Show a dot on this series at the hovered x. */
  marker?: boolean;
  /** Optional direct label at the line's end (dropped if labels would collide). */
  endLabel?: string;
}

export interface TooltipRow {
  label: string;
  value: string;
  /** Line-key color; omit for plain rows. */
  color?: string;
}

interface LineChartProps {
  series: readonly LineSeries[];
  xMax: number;
  yDomain: readonly [number, number];
  xLabel: string;
  yLabel: string;
  /** Short text alternative describing what the chart shows. */
  ariaLabel: string;
  tooltip: (x: number) => { title: string; rows: TooltipRow[] };
  height?: number;
}

const MARGIN = { top: 10, bottom: 38, left: 46 };
const LABEL_GAP = 14;

/**
 * SVG line chart with recessive hairline grid, a crosshair that snaps to whole x values and a
 * tooltip listing every series at that x. Keyboard: focus the chart, then use ←/→ (Home/End).
 */
export function LineChart({
  series,
  xMax,
  yDomain,
  xLabel,
  yLabel,
  ariaLabel,
  tooltip,
  height = 260,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef, 640);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const y = useMemo(
    () => linear(yDomain, [MARGIN.top + plotHeight, MARGIN.top]),
    [yDomain, plotHeight],
  );
  // Label placement depends only on y, so decide it before reserving room on the right.
  const endLabels = useMemo(() => placeEndLabels(series, y), [series, y]);
  const marginRight = endLabels.length > 0 ? 96 : 16;
  const plotWidth = Math.max(40, width - MARGIN.left - marginRight);
  const xMaxSafe = Math.max(1, xMax);

  const x = useMemo(
    () => linear([0, xMaxSafe], [MARGIN.left, MARGIN.left + plotWidth]),
    [xMaxSafe, plotWidth],
  );
  const xTicks = useMemo(
    () => niceTicks(0, xMaxSafe, Math.max(2, Math.floor(plotWidth / 80))),
    [xMaxSafe, plotWidth],
  );
  const yTicks = useMemo(() => niceTicks(yDomain[0], yDomain[1], 5), [yDomain]);

  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = '';
        for (let i = 0; i < s.values.length && i <= xMaxSafe; i++) {
          d += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.values[i]).toFixed(1)}`;
        }
        return d;
      }),
    [series, x, y, xMaxSafe],
  );

  const toDataX = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * width;
    return Math.min(xMaxSafe, Math.max(0, Math.round(((px - MARGIN.left) / plotWidth) * xMaxSafe)));
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    setHoverX(toDataX(event.clientX, event.currentTarget.getBoundingClientRect()));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? Math.max(1, Math.round(xMaxSafe / 20)) : 1;
    const current = hoverX ?? xMaxSafe;
    const next =
      event.key === 'ArrowRight'
        ? current + step
        : event.key === 'ArrowLeft'
          ? current - step
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? xMaxSafe
              : null;
    if (next === null) return;
    event.preventDefault();
    setHoverX(Math.min(xMaxSafe, Math.max(0, next)));
  };

  const tip = hoverX === null ? null : tooltip(hoverX);
  const hoverPx = hoverX === null ? 0 : x(hoverX);
  const tipOnLeft = hoverPx > MARGIN.left + plotWidth / 2;

  return (
    <div className="chart" ref={containerRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverX(null)}
        onFocus={() => setHoverX((h) => h ?? xMaxSafe)}
        onBlur={() => setHoverX(null)}
        onKeyDown={onKeyDown}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={y(t)}
              y2={y(t)}
              stroke={t === yDomain[0] ? 'var(--baseline)' : 'var(--grid)'}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text className="axis-text" x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            className="axis-text"
            x={x(t)}
            y={MARGIN.top + plotHeight + 16}
            textAnchor="middle"
          >
            {formatTick(t)}
          </text>
        ))}
        <text
          className="axis-title"
          x={MARGIN.left + plotWidth / 2}
          y={height - 4}
          textAnchor="middle"
        >
          {xLabel}
        </text>
        <text
          className="axis-title"
          transform={`translate(11 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {yLabel}
        </text>

        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          {series.map((s, i) => (
            <path
              key={s.id}
              d={paths[i]}
              stroke={s.color}
              strokeWidth={s.width ?? 2}
              strokeOpacity={s.opacity ?? 1}
            />
          ))}
        </g>

        {endLabels.map((l) => (
          <text key={l.id} className="end-label" x={x(l.lastIndex) + 8} y={l.cy} dy="0.32em">
            {l.text}
          </text>
        ))}

        {hoverX !== null && (
          <g pointerEvents="none">
            <line
              x1={hoverPx}
              x2={hoverPx}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              stroke="var(--ink-2)"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            {series
              .filter((s) => s.marker && hoverX < s.values.length)
              .map((s) => (
                <circle
                  key={s.id}
                  cx={hoverPx}
                  cy={y(s.values[hoverX])}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ))}
          </g>
        )}
        {/* Full-plot hit area so the pointer only needs to be near an x position. */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
        />
      </svg>

      {tip !== null && (
        <div
          className="tooltip"
          style={{
            top: MARGIN.top + 4,
            ...(tipOnLeft ? { right: width - hoverPx + 12 } : { left: hoverPx + 12 }),
          }}
        >
          <div className="title">{tip.title}</div>
          {tip.rows.map((row) => (
            <div className="row" key={row.label}>
              <span className="name">
                {row.color !== undefined && (
                  <span className="line-key" style={{ background: row.color }} />
                )}
                {row.label}
              </span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface EndLabel {
  id: string;
  text: string;
  lastIndex: number;
  cy: number;
}

/** Positions end-of-line labels, or none when converging lines would make them collide. */
function placeEndLabels(series: readonly LineSeries[], y: (v: number) => number): EndLabel[] {
  const labelled: EndLabel[] = [];
  for (const s of series) {
    if (s.endLabel === undefined || s.values.length === 0) continue;
    const last = s.values.length - 1;
    labelled.push({ id: s.id, text: s.endLabel, lastIndex: last, cy: y(s.values[last]) });
  }
  labelled.sort((a, b) => a.cy - b.cy);
  // Nudging labels apart would detach them from their lines; the legend carries identity instead.
  const collides = labelled.some((l, i) => i > 0 && l.cy - labelled[i - 1].cy < LABEL_GAP);
  return collides ? [] : labelled;
}
