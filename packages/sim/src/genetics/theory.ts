/**
 * Analytical population-genetics expectations used to validate the simulation and to show
 * "what theory predicts" next to simulated results. See docs/science/01-population-genetics.md.
 */
import type { Ploidy } from './population.ts';

export interface FixationOptions {
  /** Starting frequency of the allele. */
  p: number;
  /** Number of individuals (Wright–Fisher, so Ne = N). */
  size: number;
  ploidy: Ploidy;
  /** Selection coefficient: mutant homozygote (diploid) or mutant (haploid) has fitness 1 + s. */
  s: number;
  /** Dominance: heterozygote fitness 1 + h·s. Diploid only. Default 0.5. */
  h?: number;
}

/**
 * Probability that an allele eventually fixes, from Kimura's (1962) diffusion approximation:
 * u(p) = ∫₀ᵖ G(x) dx / ∫₀¹ G(x) dx with G(x) = exp(−∫ 2M/V), where M is the expected change in
 * frequency per generation and V = x(1 − x)/(gene copies) its variance.
 */
export function fixationProbability({ p, size, ploidy, s, h = 0.5 }: FixationOptions): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (s === 0) return p;
  if (ploidy === 1 || h === 0.5) {
    // M = (s/2)·x(1 − x) (diploid, additive) or s·x(1 − x) (haploid); either way 2M/V = 2Ns.
    const a = 2 * size * s;
    return Math.expm1(-a * p) / Math.expm1(-a);
  }
  // Diploid with dominance: M ≈ s·x(1 − x)[h + (1 − 2h)x], V = x(1 − x)/2N,
  // so log G(x) = −4Ns[h·x + (1 − 2h)x²/2]. Integrate numerically (Simpson's rule).
  const logG = (x: number) => -4 * size * s * (h * x + ((1 - 2 * h) * x * x) / 2);
  return simpsonLogIntegral(logG, 0, p) / simpsonLogIntegral(logG, 0, 1);
}

/** Expected gene diversity after t generations of pure drift: H₀(1 − 1/C)^t, C = gene copies. */
export function heterozygosityAfter(h0: number, geneCopies: number, t: number): number {
  return h0 * (1 - 1 / geneCopies) ** t;
}

/** Expected variance of the one-generation change in allele frequency: p(1 − p)/C. */
export function driftVariance(p: number, geneCopies: number): number {
  return (p * (1 - p)) / geneCopies;
}

/**
 * Equilibrium frequency of a deleterious allele under mutation–selection balance (Haldane 1927):
 * q ≈ μ/(h·s) when partially dominant, q ≈ √(μ/s) when fully recessive.
 */
export function mutationSelectionBalance(mu: number, s: number, h: number): number {
  return h > 0 ? mu / (h * s) : Math.sqrt(mu / s);
}

/**
 * Equilibrium gene diversity (by identity) under drift and infinite-alleles mutation, from the
 * exact Wright–Fisher recursion F' = (1 − μ)²[1/C + (1 − 1/C)F]. Approximately θ/(1 + θ) with
 * θ = 2Cμ (4Nμ for diploids).
 */
export function infiniteAllelesDiversity(geneCopies: number, mu: number): number {
  const keep = (1 - mu) ** 2;
  return 1 - keep / (geneCopies - (geneCopies - 1) * keep);
}

/** Simpson's rule for ∫ exp(logF), scaled to avoid overflow; returns the scaled integral. */
function simpsonLogIntegral(logF: (x: number) => number, a: number, b: number, n = 2000): number {
  // Both integrals in a ratio must share one scale, so shift by logF's maximum over [0, 1].
  let shift = -Infinity;
  for (let i = 0; i <= 100; i++) shift = Math.max(shift, logF(i / 100));
  const step = (b - a) / n;
  let sum = Math.exp(logF(a) - shift) + Math.exp(logF(b) - shift);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * Math.exp(logF(a + i * step) - shift);
  return (sum * step) / 3;
}
