import type { TraitId } from '@plant-evo/sim';
import { describe, expect, it } from 'vitest';
import { classifyGrade, drawPlant, traitRecord, typicalHeight } from './plant.ts';

const alga: Record<TraitId, number> = {
  desiccationTolerance: 0.2,
  cuticle: 0.03,
  stomata: 0.02,
  sporeWall: 0.3,
  sporophyte: 0.02,
  stature: 0.04,
  vascular: 0.03,
  rooting: 0.05,
  branching: 0.03,
  asexual: 0.6,
};
const moss = { ...alga, desiccationTolerance: 0.9, sporophyte: 0.6, sporeWall: 0.8 };
const cooksonia = { ...moss, cuticle: 0.7, vascular: 0.7, stature: 0.6, branching: 0.5 };
const rhynie = { ...cooksonia, rooting: 0.6, stomata: 0.5, branching: 0.75 };

const count = (drawing: ReturnType<typeof drawPlant>, part: string) =>
  drawing.shapes.filter((s) => s.part === part).length;

describe('classifyGrade', () => {
  it('names body plans from algae to rhyniophytes', () => {
    expect(classifyGrade(alga)).toBe('charophyte alga');
    expect(classifyGrade(moss)).toBe('bryophyte-grade plant');
    expect(classifyGrade({ ...moss, vascular: 0.4 })).toBe('protracheophyte');
    expect(classifyGrade(cooksonia)).toBe('early vascular plant');
    expect(classifyGrade(rhynie)).toBe('rhyniophyte-like plant');
  });
});

describe('drawPlant', () => {
  it('draws an alga with only a zygote as its diploid phase', () => {
    const d = drawPlant(alga, { submerged: true });
    expect(count(d, 'zygote')).toBe(1);
    expect(count(d, 'axis')).toBe(0);
    expect(count(d, 'filament')).toBeGreaterThan(0);
  });

  it('draws one sporangium per branch tip: 2^forkings', () => {
    const d = drawPlant(cooksonia);
    expect(count(d, 'sporangium')).toBe(2 ** Math.round(cooksonia.branching * 4));
    expect(count(drawPlant(moss), 'sporangium')).toBe(1);
  });

  it('draws taller, thicker axes for vascular plants and roots only with rooting', () => {
    const short = drawPlant(moss);
    const tall = drawPlant(cooksonia);
    expect(tall.heightMm).toBeGreaterThan(3 * short.heightMm);
    const width = (d: ReturnType<typeof drawPlant>) =>
      Math.max(...d.shapes.filter((s) => s.part === 'axis').map((s) => s.width));
    expect(width(tall)).toBeGreaterThan(width(short));
    expect(count(tall, 'root')).toBe(0);
    expect(count(drawPlant(rhynie), 'root')).toBeGreaterThan(0);
    expect(count(drawPlant(rhynie), 'stoma')).toBeGreaterThan(0);
  });

  it('is deterministic and keeps every coordinate finite', () => {
    const a = drawPlant(rhynie, { seed: 's' });
    expect(drawPlant(rhynie, { seed: 's' })).toEqual(a);
    for (const s of a.shapes) expect(s.d).not.toMatch(/NaN|Infinity/);
    expect(a.bounds.maxY).toBeGreaterThan(0);
    expect(a.bounds.minY).toBeLessThan(0);
    expect(a.description).toMatch(/Rhynie/);
  });

  it('accepts trait vectors and respects an explicit height', () => {
    const vector = Object.values(cooksonia);
    expect(traitRecord(vector)).toEqual(cooksonia);
    const d = drawPlant(vector, { sporophyteHeight: 0.05 });
    expect(d.heightMm).toBeGreaterThan(45);
    expect(d.heightMm).toBeLessThan(60);
    expect(typicalHeight(alga)).toBe(0);
  });
});
