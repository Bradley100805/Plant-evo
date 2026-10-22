/** Marks an allele with no ancestor in the table (founder or externally introduced). */
export const NO_PARENT = -1;

export interface AlleleTableState {
  value: Float64Array;
  locus: Int32Array;
  parent: Int32Array;
  origin: Int32Array;
}

/**
 * Registry of every allele that exists, or has descendants that exist, in a population.
 *
 * Genomes store allele ids. Each id records its additive value, the locus it belongs to, the
 * allele it mutated from, and the generation it arose in. Ids are allocated in increasing order
 * and compaction preserves that order, so a parent id is always smaller than its children's.
 */
export class AlleleTable {
  private _value: Float64Array;
  private _locus: Int32Array;
  private _parent: Int32Array;
  private _origin: Int32Array;
  private _count = 0;

  constructor(initialCapacity = 1024) {
    this._value = new Float64Array(initialCapacity);
    this._locus = new Int32Array(initialCapacity);
    this._parent = new Int32Array(initialCapacity);
    this._origin = new Int32Array(initialCapacity);
  }

  get count(): number {
    return this._count;
  }

  /** Copies of the table's contents, for saving. */
  exportState(): AlleleTableState {
    const n = this._count;
    return {
      value: this._value.slice(0, n),
      locus: this._locus.slice(0, n),
      parent: this._parent.slice(0, n),
      origin: this._origin.slice(0, n),
    };
  }

  static fromState(state: AlleleTableState): AlleleTable {
    const n = state.value.length;
    const table = new AlleleTable(Math.max(1024, n));
    table._value.set(state.value);
    table._locus.set(state.locus);
    table._parent.set(state.parent);
    table._origin.set(state.origin);
    table._count = n;
    return table;
  }

  /** Additive value of each allele, indexed by id. Valid for ids below `count`. */
  get values(): Float64Array {
    return this._value;
  }

  add(value: number, locus: number, parent: number, originGeneration: number): number {
    if (this._count === this._value.length) this.grow(this._count * 2);
    const id = this._count++;
    this._value[id] = value;
    this._locus[id] = locus;
    this._parent[id] = parent;
    this._origin[id] = originGeneration;
    return id;
  }

  value(id: number): number {
    return this._value[id];
  }

  locus(id: number): number {
    return this._locus[id];
  }

  parent(id: number): number {
    return this._parent[id];
  }

  origin(id: number): number {
    return this._origin[id];
  }

  /** Flags `ancestor` and every allele descended from it. */
  descendantMask(ancestor: number): Uint8Array {
    const mask = new Uint8Array(this._count);
    mask[ancestor] = 1;
    for (let id = ancestor + 1; id < this._count; id++) {
      const parent = this._parent[id];
      if (parent >= ancestor && mask[parent] === 1) mask[id] = 1;
    }
    return mask;
  }

  /**
   * Drops alleles that are neither in `live` nor ancestors of something in `live`.
   * Returns old id → new id (or -1 for dropped ids); callers must rewrite stored ids.
   */
  compact(live: Uint8Array): Int32Array {
    const keep = live.slice(0, this._count);
    // Children have larger ids than parents, so one descending pass marks every ancestor.
    for (let id = this._count - 1; id >= 0; id--) {
      if (keep[id] === 1 && this._parent[id] !== NO_PARENT) keep[this._parent[id]] = 1;
    }
    const remap = new Int32Array(this._count).fill(-1);
    let next = 0;
    for (let id = 0; id < this._count; id++) {
      if (keep[id] !== 1) continue;
      remap[id] = next;
      this._value[next] = this._value[id];
      this._locus[next] = this._locus[id];
      this._origin[next] = this._origin[id];
      const parent = this._parent[id];
      this._parent[next] = parent === NO_PARENT ? NO_PARENT : remap[parent];
      next++;
    }
    this._count = next;
    return remap;
  }

  private grow(capacity: number): void {
    const value = new Float64Array(capacity);
    value.set(this._value);
    this._value = value;
    const locus = new Int32Array(capacity);
    locus.set(this._locus);
    this._locus = locus;
    const parent = new Int32Array(capacity);
    parent.set(this._parent);
    this._parent = parent;
    const origin = new Int32Array(capacity);
    origin.set(this._origin);
    this._origin = origin;
  }
}
