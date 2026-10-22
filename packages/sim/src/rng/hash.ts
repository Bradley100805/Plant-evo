/** Seeds accepted throughout the simulation. Strings are hashed, numbers are used as 32-bit words. */
export type Seed = number | string;

/** FNV-1a over UTF-16 code units, finished with the murmur3 avalanche. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

/** murmur3 32-bit finalizer: spreads every input bit across the output word. */
export function fmix32(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Combines two 32-bit words into one well-mixed word (order-sensitive). */
export function mix(a: number, b: number): number {
  return fmix32((Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) + fmix32(b)) | 0);
}

export function seedToWord(seed: Seed): number {
  if (typeof seed === 'string') return hashString(seed);
  if (!Number.isFinite(seed)) throw new RangeError(`Seed must be finite, got ${seed}`);
  // Fold the high bits of large integers in so 2^32 and 0 differ.
  return fmix32((seed >>> 0) ^ Math.floor(seed / 0x100000000));
}

/** splitmix32: used only to expand one seed word into generator state. */
export function splitmix32(state: number): () => number {
  let a = state | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}
