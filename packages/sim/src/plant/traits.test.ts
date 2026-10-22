import { describe, expect, it } from 'vitest';
import { AlleleTable, NO_PARENT } from '../genetics/alleles.ts';
import {
  basesFromTraits,
  createArchitecture,
  liabilities,
  locusLabel,
  logistic,
  logit,
  MODULES,
  phenotype,
  T,
  TRAIT_COUNT,
  TRAIT_IDS,
} from './traits.ts';

describe('genome architecture', () => {
  const arch = createArchitecture(4);

  it('has trait loci plus one locus per module', () => {
    expect(arch.loci).toBe(TRAIT_COUNT * 4 + MODULES.length);
    expect(arch.locusOwner[0]).toBe(0);
    expect(arch.locusOwner[TRAIT_COUNT * 4]).toBe(-1);
    expect(locusLabel(arch, T.cuticle * 4 + 1)).toBe('Waxy cuticle 2');
    expect(locusLabel(arch, TRAIT_COUNT * 4)).toBe('Phenylpropanoid metabolism');
  });

  it('sums allele values per trait, doubles haploids, and applies module loadings', () => {
    const alleles = new AlleleTable();
    const genome = new Uint32Array(2 * arch.loci);
    for (let l = 0; l < arch.loci; l++) {
      const id = alleles.add(0, l, NO_PARENT, 0);
      genome[l] = id;
      genome[arch.loci + l] = id;
    }
    const plusOne = alleles.add(1, T.cuticle * 4, NO_PARENT, 0);
    genome[T.cuticle * 4] = plusOne; // copy 0 only
    const phenyl = alleles.add(1, TRAIT_COUNT * 4, NO_PARENT, 0);
    genome[TRAIT_COUNT * 4] = phenyl;

    const out = new Float64Array(TRAIT_COUNT);
    liabilities(arch, genome, 0, arch.loci, alleles.values, out);
    expect(out[T.cuticle]).toBe(1);
    expect(out[T.vascular]).toBeCloseTo(0.6, 12);
    expect(out[T.sporeWall]).toBeCloseTo(0.6, 12);
    expect(out[T.stomata]).toBe(0);

    liabilities(arch, genome, 0, -1, alleles.values, out);
    expect(out[T.cuticle]).toBe(2);
  });

  it('maps baselines and liabilities through the logistic', () => {
    const ancestral = Object.fromEntries(TRAIT_IDS.map((id) => [id, 0.1])) as Record<
      (typeof TRAIT_IDS)[number],
      number
    >;
    const bases = basesFromTraits(ancestral);
    const zero = new Float64Array(TRAIT_COUNT);
    const out = phenotype(bases, zero, new Float64Array(TRAIT_COUNT));
    out.forEach((v) => expect(v).toBeCloseTo(0.1, 12));
    expect(logistic(logit(0.37))).toBeCloseTo(0.37, 12);
  });
});
