import type { EpochReport, VariantOffer } from '@plant-evo/sim';
import { describe, expect, it } from 'vitest';
import { fateText, formatHeight, geneName, offerSummary } from './format.ts';

const offer = (gene: string, effects: VariantOffer['effects']): VariantOffer => ({
  index: 0,
  locus: 0,
  value: 1,
  delta: 1,
  gene,
  effects,
});

describe('game text', () => {
  it('names trait genes and module regulators', () => {
    expect(geneName(offer('Waxy cuticle 2', []))).toBe('Waxy cuticle gene 2');
    expect(geneName(offer('Phenylpropanoid metabolism', []))).toBe(
      'Phenylpropanoid metabolism regulator',
    );
  });

  it('summarises effects in the direction they push', () => {
    const o = offer('Phenylpropanoid metabolism', [
      { trait: 'vascular', from: 0.1, to: 0.4 },
      { trait: 'sporeWall', from: 0.3, to: 0.5 },
      { trait: 'stature', from: 0.2, to: 0.1 },
    ]);
    expect(offerSummary(o)).toBe(
      'Carriers develop more water-conducting tissue and sporopollenin spore wall and less upright growth.',
    );
  });

  it('formats heights in mm below a centimetre', () => {
    expect(formatHeight(0.0048)).toBe('4.8 mm');
    expect(formatHeight(0.031)).toBe('3.1 cm');
    expect(formatHeight(0)).toBe('—');
  });

  it('describes the fate of the followed mutation', () => {
    const report = {
      chosen: offer('Stomata 1', []),
      origins: 6,
      fate: 'spreading',
      variantFrequency: 0.234,
    } as EpochReport;
    expect(fateText(report)).toBe(
      'The stomata gene 1 mutation arose 6 times and has spread to 23% of plants.',
    );
    expect(fateText({ ...report, fate: 'lost', variantFrequency: 0 })).toBe(
      'The stomata gene 1 mutation arose 6 times, and every copy was lost.',
    );
    expect(fateText({ ...report, chosen: null, fate: 'none' })).toBe(
      'You followed no new mutation this epoch.',
    );
  });
});
