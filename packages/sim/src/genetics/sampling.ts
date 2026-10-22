import type { Rng } from '../rng/index.ts';

/**
 * Walker/Vose alias table: after an O(n) build, draws index i with probability
 * weights[i] / sum(weights) in O(1). Reused across generations to avoid reallocation.
 */
export class AliasSampler {
  private prob: Float64Array;
  private alias: Int32Array;
  private small: Int32Array;
  private large: Int32Array;
  private n = 0;

  constructor(capacity: number) {
    this.prob = new Float64Array(capacity);
    this.alias = new Int32Array(capacity);
    this.small = new Int32Array(capacity);
    this.large = new Int32Array(capacity);
  }

  /** Builds the table from non-negative finite weights. Returns their sum (0 = nothing to draw). */
  build(weights: Float64Array): number {
    const n = weights.length;
    if (n > this.prob.length) {
      this.prob = new Float64Array(n);
      this.alias = new Int32Array(n);
      this.small = new Int32Array(n);
      this.large = new Int32Array(n);
    }
    this.n = n;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const w = weights[i];
      if (!(w >= 0 && w < Infinity))
        throw new RangeError(`weight ${i} is ${w}; must be finite and >= 0`);
      total += w;
    }
    if (total <= 0) return 0;

    const { prob, alias, small, large } = this;
    let smallTop = 0;
    let largeTop = 0;
    const scale = n / total;
    for (let i = 0; i < n; i++) {
      prob[i] = weights[i] * scale;
      alias[i] = i;
      if (prob[i] < 1) small[smallTop++] = i;
      else large[largeTop++] = i;
    }
    while (smallTop > 0 && largeTop > 0) {
      const s = small[--smallTop];
      const l = large[--largeTop];
      alias[s] = l;
      prob[l] = prob[l] + prob[s] - 1;
      if (prob[l] < 1) small[smallTop++] = l;
      else large[largeTop++] = l;
    }
    // Whatever remains is 1 up to rounding error.
    while (largeTop > 0) prob[large[--largeTop]] = 1;
    while (smallTop > 0) prob[small[--smallTop]] = 1;
    return total;
  }

  sample(rng: Rng): number {
    const i = rng.int(this.n);
    return rng.float() < this.prob[i] ? i : this.alias[i];
  }
}
