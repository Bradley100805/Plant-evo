import { drawPlant, traitRecord } from '@plant-evo/morph';
import { useMemo } from 'react';
import { capitalise } from './format.ts';

const STROKE: Record<string, string> = {
  thallus: 'var(--plant-thallus)',
  filament: 'var(--plant-thallus)',
  axis: 'var(--plant-axis)',
  sporangium: 'var(--plant-sporangium)',
  zygote: 'var(--plant-sporangium)',
  rhizoid: 'var(--plant-root)',
  root: 'var(--plant-root)',
  stoma: 'var(--plant-stoma)',
  shine: 'var(--plant-shine)',
};

/** Side view of the lineage's typical plant, drawn from its mean traits. */
export function PlantPortrait({
  traits,
  height,
  aquatic,
  seed,
}: {
  traits: number[];
  height: number;
  aquatic: boolean;
  seed: string;
}) {
  const drawing = useMemo(
    () =>
      drawPlant(traitRecord(traits), {
        seed,
        submerged: aquatic,
        sporophyteHeight: height > 0 ? height : undefined,
      }),
    [traits, height, aquatic, seed],
  );
  const { minX, maxX, minY, maxY } = drawing.bounds;
  // Keep a minimum frame so small plants are not blown up beyond recognition.
  const top = Math.max(maxY, 30);
  const halfWidth = Math.max(maxX, -minX, (top - minY) * 0.4);
  const width = 2 * halfWidth;
  const totalHeight = top - minY;
  const scaleMm = top > 120 ? 50 : top > 40 ? 10 : 5;

  return (
    <figure className="portrait">
      <svg
        viewBox={`${-halfWidth} ${-top} ${width} ${totalHeight}`}
        role="img"
        aria-label={drawing.description}
        preserveAspectRatio="xMidYMax meet"
      >
        <g transform="scale(1,-1)">
          {/* Backgrounds run well past the frame: a wide figure shows more than the viewBox. */}
          {aquatic ? (
            <rect
              x={-10 * halfWidth}
              y={0}
              width={20 * halfWidth}
              height={top}
              fill="var(--water)"
            />
          ) : null}
          <rect
            x={-10 * halfWidth}
            y={minY}
            width={20 * halfWidth}
            height={-minY}
            fill="var(--soil)"
          />
          {drawing.shapes.map((s, i) =>
            s.width > 0 ? (
              <path
                key={i}
                d={s.d}
                fill="none"
                stroke={STROKE[s.part]}
                strokeWidth={s.width}
                strokeLinecap="round"
              />
            ) : (
              <path key={i} d={s.d} fill={STROKE[s.part]} />
            ),
          )}
          <g transform={`translate(${halfWidth - scaleMm - 2} ${top - 4})`}>
            <line x1={0} x2={scaleMm} y1={0} y2={0} stroke="var(--ink-2)" strokeWidth={top / 200} />
          </g>
        </g>
        <text
          x={halfWidth - scaleMm / 2 - 2}
          y={-top + 4 + top / 25}
          textAnchor="middle"
          className="scale-label"
          style={{ fontSize: top / 22 }}
        >
          {scaleMm >= 10 ? `${scaleMm / 10} cm` : `${scaleMm} mm`}
        </text>
      </svg>
      <figcaption>
        <strong>{capitalise(drawing.grade)}</strong>
        <span>{drawing.description}</span>
      </figcaption>
    </figure>
  );
}
