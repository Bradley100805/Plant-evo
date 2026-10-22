/**
 * Procedural plant drawings from trait values. Specification: docs/science/06-morphology.md.
 *
 * The sporophyte is grown with a parametric L-system of the kind Prusinkiewicz & Lindenmayer
 * (1990) describe, using the dichotomous (forking) branching typical of the earliest vascular
 * plants:
 *
 *   ω: A(L₀, n)
 *   A(l, k) : k > 0 → F(l) [ +θ A(l·r, k−1) ] [ −θ A(l·r, k−1) ]
 *   A(l, 0)         → F(l) S         (S = terminal sporangium)
 *
 * The number of forkings n comes from the branching trait, the axis thickness from the
 * vascular trait, and the overall height from the sporophyte's computed height. The haploid
 * gametophyte is drawn as a lobed thallus on the ground (or algal filaments under water).
 *
 * Coordinates are millimetres with y pointing up and the ground surface at y = 0.
 */
import { Rng, T, TRAIT_COUNT, TRAIT_IDS, type TraitId } from '@plant-evo/sim';

export type Part =
  | 'thallus'
  | 'filament'
  | 'axis'
  | 'sporangium'
  | 'zygote'
  | 'rhizoid'
  | 'root'
  | 'stoma'
  | 'shine';

export interface Shape {
  part: Part;
  /** SVG path data in millimetres, y up. */
  d: string;
  /** Stroke width in millimetres (0 for filled shapes). */
  width: number;
}

export interface PlantDrawing {
  shapes: Shape[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Height of the tallest part above ground, millimetres. */
  heightMm: number;
  grade: Grade;
  /** Plain-language description, for alt text. */
  description: string;
}

export interface DrawOptions {
  seed?: string;
  /** Sporophyte height to draw, metres. Default: derived from the traits. */
  sporophyteHeight?: number;
  /** Draw the aquatic form (algal filaments) instead of a thallus on land. */
  submerged?: boolean;
}

export type Grade =
  | 'charophyte alga'
  | 'bryophyte-grade plant'
  | 'protracheophyte'
  | 'early vascular plant'
  | 'rhyniophyte-like plant';

/** A rough body-plan label, used for captions and the end-of-chapter comparison. */
export function classifyGrade(t: Readonly<Record<TraitId, number>>): Grade {
  if (t.sporophyte < 0.15) return 'charophyte alga';
  if (t.vascular < 0.3) return 'bryophyte-grade plant';
  if (t.vascular < 0.5 || t.stature < 0.3) return 'protracheophyte';
  if (t.rooting >= 0.4 && t.branching >= 0.3) return 'rhyniophyte-like plant';
  return 'early vascular plant';
}

export function traitRecord(values: ArrayLike<number>): Record<TraitId, number> {
  if (values.length !== TRAIT_COUNT) throw new RangeError(`Expected ${TRAIT_COUNT} trait values`);
  return Object.fromEntries(TRAIT_IDS.map((id, i) => [id, values[i]])) as Record<TraitId, number>;
}

/** Sporophyte height (m) implied by traits for a well-grown plant (mirrors the physiology). */
export function typicalHeight(t: Readonly<Record<TraitId, number>>): number {
  const max = 0.003 + t.stature * (0.03 + 0.5 * t.vascular);
  return t.sporophyte < 0.15 ? 0 : max * (0.4 + 0.5 * t.sporophyte);
}

const f = (x: number) => Number(x.toFixed(2));

export function drawPlant(
  traits: Readonly<Record<TraitId, number>> | ArrayLike<number>,
  options: DrawOptions = {},
): PlantDrawing {
  const t = isRecord(traits) ? traits : traitRecord(traits);
  const rng = new Rng(options.seed ?? 'plant');
  const shapes: Shape[] = [];
  const grade = classifyGrade(t);
  const heightMm = 1000 * (options.sporophyteHeight ?? typicalHeight(t));

  // --- Gametophyte -------------------------------------------------------------------------
  if (options.submerged) {
    drawFilaments(shapes, rng);
  } else {
    drawThallus(shapes, t, rng);
  }

  // --- Below ground -----------------------------------------------------------------------
  const rhizoidLength = 1.5 + 6 * t.rooting;
  for (let i = 0; i < 9; i++) {
    const x = -9 + 2.2 * i + rng.normal(0, 0.4);
    const bend = rng.normal(0, 0.8);
    const len = rhizoidLength * (0.6 + 0.4 * rng.float());
    shapes.push({
      part: 'rhizoid',
      d: `M${f(x)},0 q${f(bend)},${f(-len / 2)} ${f(bend * 0.5)},${f(-len)}`,
      width: 0.12,
    });
  }
  let rootDepth = rhizoidLength;
  if (t.vascular > 0.3 && t.rooting > 0.3) {
    rootDepth = drawRootingAxes(shapes, t, rng);
  }

  // --- Sporophyte -------------------------------------------------------------------------
  let top = options.submerged ? 16 : 3;
  let maxX = 14;
  if (t.sporophyte < 0.15) {
    // Zygotic meiosis: the only diploid cell is a walled zygote on the thallus.
    shapes.push({ part: 'zygote', d: circle(2, options.submerged ? 9 : 2.6, 0.9), width: 0 });
  } else {
    const h = Math.max(3, heightMm);
    const axisWidth = 0.35 + 1.4 * t.vascular;
    const forkings = t.stature < 0.2 && t.vascular < 0.3 ? 0 : Math.round(t.branching * 4);
    const angle = (32 - 14 * t.vascular) * (Math.PI / 180);
    // Real sporangia were 1–2 mm across; keep them visible on tall plants too.
    const sporangiumSize = Math.max(0.9 + 1.4 * t.sporophyte, 0.022 * h);
    const base = options.submerged ? 6 : 2.4;
    const ratio = 0.72;
    let span = 0;
    for (let i = 0; i <= forkings; i++) span += ratio ** i;
    const first = (h - base) / span;
    const grow = (x: number, y: number, dir: number, len: number, k: number, width: number) => {
      const jitter = rng.normal(0, 0.05);
      const x2 = x + Math.sin(dir + jitter) * len;
      const y2 = y + Math.cos(dir + jitter) * len;
      shapes.push({
        part: 'axis',
        d: `M${f(x)},${f(y)} Q${f((x + x2) / 2 + rng.normal(0, len * 0.04))},${f((y + y2) / 2)} ${f(x2)},${f(y2)}`,
        width: f(width),
      });
      if (t.stomata > 0.2 && len > 2.5) {
        for (let s = 0; s < Math.round(t.stomata * 3); s++) {
          const u = 0.25 + 0.5 * rng.float();
          shapes.push({
            part: 'stoma',
            d: circle(x + (x2 - x) * u, y + (y2 - y) * u, Math.max(0.12, width * 0.22)),
            width: 0,
          });
        }
      }
      top = Math.max(top, y2);
      maxX = Math.max(maxX, Math.abs(x2) + sporangiumSize);
      if (k === 0) {
        shapes.push({
          part: 'sporangium',
          d: ellipse(x2, y2 + sporangiumSize * 0.55, sporangiumSize * 0.75, sporangiumSize * 0.55),
          width: 0,
        });
        top = Math.max(top, y2 + sporangiumSize * 1.1);
        return;
      }
      grow(x2, y2, dir + angle, len * ratio, k - 1, width * 0.8);
      grow(x2, y2, dir - angle, len * ratio, k - 1, width * 0.8);
    };
    grow(2, base, rng.normal(0, 0.04), first, forkings, axisWidth);
    if (t.cuticle > 0.4) {
      shapes.push({
        part: 'shine',
        d: `M${f(2 + axisWidth * 0.3)},${f(base + 1)} L${f(2 + axisWidth * 0.3)},${f(base + first * 0.7)}`,
        width: f(Math.max(0.1, axisWidth * 0.18)),
      });
    }
  }

  return {
    shapes,
    bounds: { minX: -maxX, maxX, minY: -rootDepth - 1, maxY: top + 1 },
    heightMm: top,
    grade,
    description: describe(t, grade, heightMm),
  };
}

function drawThallus(shapes: Shape[], t: Readonly<Record<TraitId, number>>, rng: Rng): void {
  const lobes = 5;
  const thickness = 1.6 + 1.2 * t.cuticle;
  for (let i = 0; i < lobes; i++) {
    const cx = -9 + (18 * i) / (lobes - 1) + rng.normal(0, 0.5);
    const rx = 3.4 + rng.float();
    shapes.push({
      part: 'thallus',
      d: ellipse(cx, thickness * 0.45, rx, thickness * (0.8 + 0.3 * rng.float())),
      width: 0,
    });
  }
  if (t.cuticle > 0.3) {
    shapes.push({
      part: 'shine',
      d: `M-8,${f(thickness * 1.15)} Q0,${f(thickness * 1.5)} 8,${f(thickness * 1.15)}`,
      width: 0.25,
    });
  }
}

function drawFilaments(shapes: Shape[], rng: Rng): void {
  for (let i = 0; i < 5; i++) {
    let x = -8 + 4 * i + rng.normal(0, 0.5);
    let y = 0;
    let d = `M${f(x)},0`;
    for (let s = 0; s < 6; s++) {
      const nx = x + rng.normal(0, 1.2);
      const ny = y + 2.4 + rng.float();
      d += ` Q${f(x + rng.normal(0, 1))},${f((y + ny) / 2)} ${f(nx)},${f(ny)}`;
      if (s % 2 === 1) {
        // Whorled side branches, as in stoneworts.
        shapes.push({ part: 'filament', d: `M${f(nx)},${f(ny)} l-2.2,1.2`, width: 0.3 });
        shapes.push({ part: 'filament', d: `M${f(nx)},${f(ny)} l2.2,1.2`, width: 0.3 });
      }
      x = nx;
      y = ny;
    }
    shapes.push({ part: 'filament', d, width: 0.55 });
  }
}

function drawRootingAxes(shapes: Shape[], t: Readonly<Record<TraitId, number>>, rng: Rng): number {
  // A creeping rhizome just below ground with downward rooting axes.
  const depth = 3 + 18 * t.rooting * (0.2 + 0.8 * t.vascular);
  shapes.push({ part: 'root', d: 'M-12,-1.2 Q0,-2.2 12,-1.2', width: f(0.4 + 0.8 * t.vascular) });
  const count = 2 + Math.round(3 * t.rooting);
  for (let i = 0; i < count; i++) {
    const x = -10 + (20 * (i + 0.5)) / count;
    const len = depth * (0.6 + 0.4 * rng.float());
    const bend = rng.normal(0, 1.5);
    shapes.push({
      part: 'root',
      d: `M${f(x)},-1.6 q${f(bend)},${f(-len / 2)} ${f(bend * 0.6)},${f(-len)}`,
      width: f(0.25 + 0.4 * t.vascular),
    });
  }
  return depth + 2;
}

function describe(t: Readonly<Record<TraitId, number>>, grade: Grade, heightMm: number): string {
  const size = heightMm >= 10 ? `${(heightMm / 10).toFixed(1)} cm` : `${heightMm.toFixed(0)} mm`;
  switch (grade) {
    case 'charophyte alga':
      return 'A green alga: a haploid body whose only diploid cell is the zygote.';
    case 'bryophyte-grade plant':
      return `A low, moss-like plant: a haploid thallus carrying a small unbranched sporophyte about ${size} tall.`;
    case 'protracheophyte':
      return `A small plant with a ${size} sporophyte that is starting to conduct water and stand up.`;
    case 'early vascular plant':
      return `An early vascular plant like Cooksonia: a leafless ${size} sporophyte, forking ${Math.round(t.branching * 4)} times, tipped with sporangia.`;
    case 'rhyniophyte-like plant':
      return `A plant like those of the Rhynie chert: ${size} tall, forking stems on a rooting rhizome.`;
  }
}

function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r);
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)},${f(cy)} a${f(rx)},${f(ry)} 0 1,0 ${f(2 * rx)},0 a${f(rx)},${f(ry)} 0 1,0 ${f(-2 * rx)},0 Z`;
}

function isRecord(x: unknown): x is Readonly<Record<TraitId, number>> {
  return typeof x === 'object' && x !== null && !('length' in x) && T.cuticle !== undefined;
}
