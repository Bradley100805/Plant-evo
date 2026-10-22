import { describe, expect, it } from 'vitest';
import {
  arrhenius,
  assimilate,
  BERNACCHI_2001,
  coupledRate,
  DEFAULT_LEAF,
  electronTransport,
  leafRates,
  peakedArrhenius,
} from './photosynthesis.ts';

/** FvCB demand at a given Ci, written out independently of the coupled solution. */
function fvcbAtCi(ci: number, par: number, tempC: number, o2 = 210) {
  const r = leafRates(DEFAULT_LEAF, tempC, o2);
  const j = electronTransport(par, r.jmax, DEFAULT_LEAF.alpha, DEFAULT_LEAF.theta);
  const wc = (r.vcmax * (ci - r.gammaStar)) / (ci + r.km);
  const wj = (j * (ci - r.gammaStar)) / (4 * ci + 8 * r.gammaStar);
  return Math.min(wc, wj) - r.rd;
}

describe('temperature functions', () => {
  it('return the 25 °C values at 25 °C', () => {
    expect(arrhenius(10, 50, 25)).toBeCloseTo(10, 12);
    expect(peakedArrhenius(10, 50, 25)).toBeCloseTo(10, 12);
    const r = leafRates(DEFAULT_LEAF, 25, 210);
    expect(r.gammaStar).toBeCloseTo(BERNACCHI_2001.gammaStar25, 10);
    expect(r.km).toBeCloseTo(404.9 * (1 + 210 / 278.4), 6);
  });

  it('match a hand calculation of Rubisco-limited assimilation', () => {
    // Vcmax 100, Ci 300 µmol/mol, 25 °C, 21% O2:
    // K = 404.9(1 + 210/278.4) = 710.33; Wc = 100(300 − 42.75)/(300 + 710.33) = 25.462.
    const k = 404.9 * (1 + 210 / 278.4);
    expect((100 * (300 - 42.75)) / (300 + k)).toBeCloseTo(25.462, 3);
  });

  it('peak Vcmax at a high temperature and decline beyond it', () => {
    const v = (t: number) => peakedArrhenius(1, BERNACCHI_2001.eaVcmax, t);
    expect(v(35)).toBeGreaterThan(v(25));
    expect(v(50)).toBeLessThan(v(40));
  });
});

describe('electron transport', () => {
  it('rises with light and saturates at Jmax', () => {
    expect(electronTransport(0, 100, 0.24, 0.7)).toBe(0);
    const low = electronTransport(100, 100, 0.24, 0.7);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(0.24 * 100);
    expect(electronTransport(5000, 100, 0.24, 0.7)).toBeLessThan(100);
    expect(electronTransport(5000, 100, 0.24, 0.7)).toBeGreaterThan(95);
  });
});

describe('coupled supply and demand', () => {
  it('returns a rate consistent with both supply and the FvCB demand', () => {
    for (const g of [0.002, 0.02, 0.2]) {
      for (const ca of [400, 2500]) {
        const r = leafRates(DEFAULT_LEAF, 25, 210);
        const { a, ci } = assimilate(g, ca, 1200, r);
        expect(a).toBeCloseTo(g * (ca - ci), 9);
        expect(a).toBeCloseTo(fvcbAtCi(ci, 1200, 25), 6);
      }
    }
  });

  it('gives zero net exchange with no conductance and −Rd in darkness with open pores', () => {
    const r = leafRates(DEFAULT_LEAF, 25, 210);
    expect(assimilate(0, 400, 1000, r).a).toBe(0);
    expect(assimilate(10, 400, 0, r).a).toBeCloseTo(-r.rd, 2);
  });

  it('increases with CO2 and with conductance, and is lower under more O2', () => {
    const r = leafRates(DEFAULT_LEAF, 25, 210);
    const a = (g: number, ca: number, rates = r) => assimilate(g, ca, 1200, rates).a;
    expect(a(0.1, 400)).toBeLessThan(a(0.1, 1000));
    expect(a(0.01, 400)).toBeLessThan(a(0.1, 400));
    expect(a(0.1, 400, leafRates(DEFAULT_LEAF, 25, 150))).toBeGreaterThan(a(0.1, 400));
  });

  it('is near-linear in conductance when diffusion limits (as under water)', () => {
    const r = leafRates(DEFAULT_LEAF, 25, 210);
    const a1 = assimilate(0.0005, 400, 1200, r).a;
    const a2 = assimilate(0.001, 400, 1200, r).a;
    expect(a2 / a1).toBeGreaterThan(1.8);
  });

  it('handles the degenerate quadratic without NaN', () => {
    expect(Number.isFinite(coupledRate(1e-9, 400, 0, 1, 40, 0))).toBe(true);
  });
});
