import { TRAIT_COUNT, TRAIT_IDS, TRAIT_INFO, type TraitId, ZONES } from '@plant-evo/sim';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { useElementWidth } from '../charts/useElementWidth.ts';
import { capitalise, formatHeight } from './format.ts';
import type { MapView } from './protocol.ts';

export type Overlay = 'plants' | 'height' | TraitId;

const ZONE_VARS = ['--zone-water', '--zone-shallows', '--zone-margin', '--zone-damp', '--zone-dry'];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Terrain without hue, so a data overlay's colour ramp reads cleanly on top of it. */
function neutral(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const v = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
  return `rgb(${v},${v},${v})`;
}

/** One-hue sequential ramp between the theme's low and high magnitude colours. */
function ramp(value: number, low: string, high: string): string {
  const a = parseHex(low);
  const b = parseHex(high);
  const t = Math.max(0, Math.min(1, value));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Height scale for the overlay: 0 to 25 cm on a square-root axis (most plants are small). */
const HEIGHT_MAX = 0.25;

export function LandscapeMap({ map, overlay }: { map: MapView; overlay: Overlay }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useElementWidth(containerRef, 480);
  const cell = Math.max(4, Math.min(16, Math.floor(width / map.width)));
  const pixelWidth = cell * map.width;
  const pixelHeight = cell * map.height;
  const [hover, setHover] = useState<number | null>(null);
  const [theme, setTheme] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme((t) => t + 1);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = pixelWidth * ratio;
    canvas.height = pixelHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const zoneColours = ZONE_VARS.map(cssVar).map((c) => (overlay === 'plants' ? c : neutral(c)));
    const plant = cssVar('--plant-thallus');
    const plantStrong = cssVar('--plant-axis');
    const low = cssVar('--ramp-low');
    const high = cssVar('--ramp-high');
    const traitIndex =
      overlay === 'plants' || overlay === 'height' ? -1 : TRAIT_IDS.indexOf(overlay);

    for (let c = 0; c < map.width * map.height; c++) {
      const x = (c % map.width) * cell;
      const y = Math.floor(c / map.width) * cell;
      ctx.fillStyle = zoneColours[map.zone[c]];
      ctx.fillRect(x, y, cell, cell);
      if (map.occupied[c] === 0) continue;
      const inset = Math.max(1, Math.round(cell * 0.12));
      if (overlay === 'plants') {
        ctx.fillStyle = map.reproduced[c] === 1 ? plantStrong : plant;
        ctx.globalAlpha = map.reproduced[c] === 1 ? 1 : 0.55;
      } else if (overlay === 'height') {
        ctx.fillStyle = ramp(Math.sqrt(map.sporophyteHeight[c] / HEIGHT_MAX), low, high);
      } else {
        ctx.fillStyle = ramp(map.traits[c * TRAIT_COUNT + traitIndex], low, high);
      }
      ctx.fillRect(x + inset, y + inset, cell - 2 * inset, cell - 2 * inset);
      ctx.globalAlpha = 1;
    }
    if (hover !== null) {
      ctx.strokeStyle = cssVar('--ink');
      ctx.lineWidth = 2;
      ctx.strokeRect(
        (hover % map.width) * cell + 1,
        Math.floor(hover / map.width) * cell + 1,
        cell - 2,
        cell - 2,
      );
    }
  }, [map, overlay, cell, pixelWidth, pixelHeight, hover, theme]);

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * map.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * map.height);
    setHover(x >= 0 && y >= 0 && x < map.width && y < map.height ? y * map.width + x : null);
  };

  const occupied = map.occupied.reduce((n, v) => n + v, 0);
  const reproduced = map.reproduced.reduce((n, v) => n + v, 0);

  return (
    <div className="map" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ width: pixelWidth, height: pixelHeight }}
        role="img"
        aria-label={`Map of the pond margin, ${map.width} by ${map.height} patches of ${map.cellSize * 100} cm. ${occupied} patches hold plants; ${reproduced} reproduced last year.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      />
      <div className="map-axis" style={{ width: pixelWidth }}>
        <span>← Open water</span>
        <span>{(map.width * map.cellSize).toFixed(1)} m</span>
        <span>Dry ground →</span>
      </div>
      {hover !== null && <CellInfo map={map} cell={hover} overlay={overlay} />}
      <MapLegend overlay={overlay} />
    </div>
  );
}

function CellInfo({ map, cell, overlay }: { map: MapView; cell: number; overlay: Overlay }) {
  const elevation = map.elevation[cell];
  const occupied = map.occupied[cell] === 1;
  return (
    <div className="cell-info" role="status">
      <strong>{capitalise(ZONES[map.zone[cell]])}</strong>
      <span>
        {map.wetDepth[cell] > 0
          ? `under ${(map.wetDepth[cell] * 100).toFixed(0)} cm of water in the wet season`
          : `${(elevation * 100).toFixed(0)} cm above the lake`}
      </span>
      <span>
        {occupied
          ? map.reproduced[cell] === 1
            ? 'Plant: reproduced last year'
            : 'Plant: did not reproduce last year'
          : 'No plant'}
      </span>
      {occupied && map.sporophyteHeight[cell] > 0 && (
        <span>Sporophyte {formatHeight(map.sporophyteHeight[cell])} tall</span>
      )}
      {occupied && overlay !== 'plants' && overlay !== 'height' && (
        <span>
          {TRAIT_INFO[overlay].label}:{' '}
          {map.traits[cell * TRAIT_COUNT + TRAIT_IDS.indexOf(overlay)].toFixed(2)}
        </span>
      )}
    </div>
  );
}

function MapLegend({ overlay }: { overlay: Overlay }) {
  return (
    <div className="map-legend">
      <ul aria-label="Zones" className={overlay === 'plants' ? undefined : 'neutral'}>
        {ZONES.map((zone, i) => (
          <li key={zone}>
            <span className="swatch" style={{ background: `var(${ZONE_VARS[i]})` }} />
            {capitalise(zone)}
          </li>
        ))}
      </ul>
      {overlay === 'plants' ? (
        <ul aria-label="Plants">
          <li>
            <span className="swatch inset" style={{ background: 'var(--plant-axis)' }} />
            Reproduced last year
          </li>
          <li>
            <span className="swatch inset faded" style={{ background: 'var(--plant-thallus)' }} />
            Did not reproduce
          </li>
        </ul>
      ) : (
        <div className="ramp-legend">
          <span>0</span>
          <span className="ramp" />
          <span>{overlay === 'height' ? '25 cm' : '1'}</span>
        </div>
      )}
    </div>
  );
}
