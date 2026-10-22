import { hashString, mix, type Seed, seedToWord, splitmix32 } from './hash.ts';

const TWO_POW_32 = 0x100000000;

/** Serializable generator state, for saves and replays. */
export interface RngState {
  key: number;
  s: [number, number, number, number];
  spareNormal: number | null;
}

/**
 * Seeded xoshiro128** generator (Blackman & Vigna).
 *
 * Every random draw in the simulation goes through an `Rng`. Streams are derived by name with
 * {@link Rng.fork}, which depends only on the parent's seed key, never on how many numbers the
 * parent has produced. Adding a new subsystem with its own stream therefore never shifts the
 * results of existing ones.
 *
 * Determinism caveat: `normal`, `exponential` and `geometric` use `Math.log`/`Math.sqrt`, which
 * are bit-identical within one JavaScript engine but not guaranteed across engines.
 */
export class Rng {
  /** Seed key this stream was derived from; forks hash their label against it. */
  readonly key: number;
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private spareNormal: number | null = null;

  constructor(seed: Seed) {
    this.key = seedToWord(seed);
    const next = splitmix32(this.key);
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  static fromState(state: RngState): Rng {
    const rng = new Rng(state.key);
    rng.setState(state);
    return rng;
  }

  /** Independent child stream named `label`. Same parent key + label always gives the same stream. */
  fork(label: string | number): Rng {
    const word = typeof label === 'number' ? seedToWord(label) : hashString(label);
    return new Rng(mix(this.key, word));
  }

  getState(): RngState {
    return {
      key: this.key,
      s: [this.s0, this.s1, this.s2, this.s3],
      spareNormal: this.spareNormal,
    };
  }

  setState(state: RngState): void {
    [this.s0, this.s1, this.s2, this.s3] = state.s;
    this.spareNormal = state.spareNormal;
  }

  /** Uniform 32-bit unsigned integer. */
  nextUint32(): number {
    const s1 = this.s1;
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform float in [0, 1) with 32 bits of resolution. */
  float(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  /** Uniform integer in [0, n), without modulo bias. */
  int(n: number): number {
    if (!(n >= 1 && n <= TWO_POW_32 && Number.isInteger(n))) {
      throw new RangeError(`int(n) needs an integer 1 <= n <= 2^32, got ${n}`);
    }
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return x % n;
  }

  /** True with probability p. */
  bernoulli(p: number): boolean {
    return this.float() < p;
  }

  /** Normal deviate (Marsaglia polar method). */
  normal(mean = 0, sd = 1): number {
    if (this.spareNormal !== null) {
      const z = this.spareNormal;
      this.spareNormal = null;
      return mean + sd * z;
    }
    let u: number;
    let v: number;
    let s: number;
    do {
      u = 2 * this.float() - 1;
      v = 2 * this.float() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareNormal = v * factor;
    return mean + sd * u * factor;
  }

  /** Exponential deviate with the given rate. */
  exponential(rate = 1): number {
    return -Math.log(1 - this.float()) / rate;
  }

  /**
   * Number of failures before the first success in Bernoulli(p) trials.
   * Used to skip directly to the next mutation instead of testing every locus.
   */
  geometric(p: number): number {
    if (p >= 1) return 0;
    if (p <= 0) return Infinity;
    return Math.floor(Math.log(1 - this.float()) / Math.log1p(-p));
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T extends { length: number; [i: number]: unknown }>(items: T): T {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}
