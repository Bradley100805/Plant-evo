/**
 * C3 photosynthesis: the Farquhar–von Caemmerer–Berry (FvCB) model, solved together with CO₂
 * supply through a conductance. Specification: docs/science/03-plant-physiology.md §3.
 *
 * Units: CO₂ and Γ* in µmol mol⁻¹ (ppm); O₂ in mmol mol⁻¹; conductances in mol m⁻² s⁻¹;
 * rates in µmol m⁻² s⁻¹; light (PAR) in µmol photons m⁻² s⁻¹; temperature in °C.
 */

const R_GAS = 8.314e-3; // kJ mol⁻¹ K⁻¹
const T25 = 298.15;

/** Bernacchi et al. (2001) values at 25 °C and activation energies (kJ mol⁻¹). */
export const BERNACCHI_2001 = {
  kc25: 404.9, // µmol mol⁻¹
  ko25: 278.4, // mmol mol⁻¹
  gammaStar25: 42.75, // µmol mol⁻¹ at 210 mmol mol⁻¹ O₂
  eaKc: 79.43,
  eaKo: 36.38,
  eaGammaStar: 37.83,
  eaVcmax: 65.33,
  eaRd: 46.39,
} as const;

/** High-temperature deactivation (peaked Arrhenius), typical values (Medlyn et al. 2002). */
const DEACTIVATION = { hd: 200, entropy: 0.65 } as const;
/** Activation energy for Jmax: calibration value inside the published 30–60 kJ mol⁻¹ range. */
const EA_JMAX = 50;

export interface LeafTraits {
  /** Maximum carboxylation rate at 25 °C. */
  vcmax25: number;
  /** Jmax/Vcmax at 25 °C (≈ 1.7–2 in vascular plants). */
  jmaxRatio: number;
  /** Day respiration as a fraction of Vcmax at 25 °C (Collatz et al. 1991 use 0.015). */
  rdFraction: number;
  /** Quantum yield of electron transport on an incident-light basis. */
  alpha: number;
  /** Curvature of the light response of electron transport. */
  theta: number;
}

export const DEFAULT_LEAF: LeafTraits = {
  vcmax25: 40,
  jmaxRatio: 1.8,
  rdFraction: 0.015,
  alpha: 0.24,
  theta: 0.7,
};

export interface LeafRates {
  vcmax: number;
  jmax: number;
  rd: number;
  gammaStar: number;
  /** Effective Michaelis constant for CO₂ including O₂ competition: Kc(1 + O/Ko). */
  km: number;
}

export function arrhenius(k25: number, ea: number, tempC: number): number {
  const tk = tempC + 273.15;
  return k25 * Math.exp((ea * (tk - T25)) / (T25 * R_GAS * tk));
}

/** Arrhenius rise with enzyme deactivation above an optimum. */
export function peakedArrhenius(k25: number, ea: number, tempC: number): number {
  const tk = tempC + 273.15;
  const { hd, entropy } = DEACTIVATION;
  const norm = 1 + Math.exp((T25 * entropy - hd) / (T25 * R_GAS));
  const deactivation = 1 + Math.exp((tk * entropy - hd) / (tk * R_GAS));
  return (arrhenius(k25, ea, tempC) * norm) / deactivation;
}

/** Temperature- and O₂-adjusted biochemical rates for a leaf. `o2` in mmol mol⁻¹ (21% = 210). */
export function leafRates(leaf: LeafTraits, tempC: number, o2: number): LeafRates {
  const b = BERNACCHI_2001;
  const kc = arrhenius(b.kc25, b.eaKc, tempC);
  const ko = arrhenius(b.ko25, b.eaKo, tempC);
  // Γ* = 0.5·O/τ, so it scales in proportion to O₂.
  const gammaStar = arrhenius(b.gammaStar25, b.eaGammaStar, tempC) * (o2 / 210);
  return {
    vcmax: peakedArrhenius(leaf.vcmax25, b.eaVcmax, tempC),
    jmax: peakedArrhenius(leaf.vcmax25 * leaf.jmaxRatio, EA_JMAX, tempC),
    rd: arrhenius(leaf.vcmax25 * leaf.rdFraction, b.eaRd, tempC),
    gammaStar,
    km: kc * (1 + o2 / ko),
  };
}

/** Electron transport rate: non-rectangular hyperbola in absorbed light. */
export function electronTransport(par: number, jmax: number, alpha: number, theta: number): number {
  if (par <= 0 || jmax <= 0) return 0;
  const ai = alpha * par;
  const s = ai + jmax;
  return (s - Math.sqrt(Math.max(0, s * s - 4 * theta * ai * jmax))) / (2 * theta);
}

/**
 * Net assimilation when the biochemical demand A = V(Ci − Γ*)/(Ci + K) − Rd must equal the
 * diffusive supply A = g(Ca − Ci). Eliminating Ci gives A² − bA + c = 0 with
 * b = g(Ca + K) + V − Rd and c = g[V(Ca − Γ*) − Rd(Ca + K)]; the physical root is the smaller.
 */
export function coupledRate(
  g: number,
  ca: number,
  v: number,
  k: number,
  gammaStar: number,
  rd: number,
): number {
  if (g <= 0) return 0;
  const b = g * (ca + k) + v - rd;
  const c = g * (v * (ca - gammaStar) - rd * (ca + k));
  const root = Math.sqrt(Math.max(0, b * b - 4 * c));
  const denom = b + root;
  // Numerically stable form of (b − root)/2.
  return denom > 0 ? (2 * c) / denom : (b - root) / 2;
}

export interface Assimilation {
  /** Net assimilation, µmol m⁻² s⁻¹. */
  a: number;
  /** Intercellular CO₂, µmol mol⁻¹. */
  ci: number;
  limitedBy: 'rubisco' | 'light';
}

/** Net CO₂ assimilation of a leaf at total CO₂ conductance `gc` and incident light `par`. */
export function assimilate(
  gc: number,
  ca: number,
  par: number,
  rates: LeafRates,
  leaf: LeafTraits = DEFAULT_LEAF,
): Assimilation {
  const j = electronTransport(par, rates.jmax, leaf.alpha, leaf.theta);
  const ac = coupledRate(gc, ca, rates.vcmax, rates.km, rates.gammaStar, rates.rd);
  const aj = coupledRate(gc, ca, j / 4, 2 * rates.gammaStar, rates.gammaStar, rates.rd);
  const a = Math.min(ac, aj);
  return { a, ci: gc > 0 ? ca - a / gc : ca, limitedBy: ac <= aj ? 'rubisco' : 'light' };
}
