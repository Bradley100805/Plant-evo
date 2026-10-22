import { describe, expect, it } from 'vitest';
import { parseCommandLine, usage, UsageError } from './commands.ts';

describe('parseCommandLine', () => {
  it('fills defaults and parses numeric options', () => {
    const parsed = parseCommandLine(['drift', '--size', '50', '--seed', 'abc', '-o', 'out.csv']);
    expect(parsed).toEqual({
      name: 'drift',
      values: { seed: 'abc', size: 50, ploidy: 2, generations: 200, replicates: 10, p0: 0.5 },
      out: 'out.csv',
    });
  });

  it('returns null for help', () => {
    expect(parseCommandLine([])).toBeNull();
    expect(parseCommandLine(['--help'])).toBeNull();
    expect(parseCommandLine(['sweep', '--help'])).toBeNull();
  });

  it('rejects unknown commands, unknown options and non-numeric values', () => {
    expect(() => parseCommandLine(['bogus'])).toThrow(UsageError);
    expect(() => parseCommandLine(['drift', '--nope', '1'])).toThrow(TypeError);
    expect(() => parseCommandLine(['drift', '--size', 'big'])).toThrow(UsageError);
  });

  it('rejects values outside each option’s range', () => {
    expect(() => parseCommandLine(['drift', '--replicates', '0'])).toThrow(UsageError);
    expect(() => parseCommandLine(['drift', '--size', '0'])).toThrow(UsageError);
    expect(() => parseCommandLine(['drift', '--size', '2.5'])).toThrow(UsageError);
    expect(() => parseCommandLine(['drift', '--p0', '1.5'])).toThrow(UsageError);
    expect(() => parseCommandLine(['sweep', '--s=-2'])).toThrow(UsageError);
    expect(() => parseCommandLine(['quant', '--fraction', '0'])).toThrow(UsageError);
    expect(parseCommandLine(['sweep', '--s=-0.5'])?.values.s).toBe(-0.5);
  });

  it('documents every command', () => {
    const text = usage();
    for (const name of ['drift', 'sweep', 'mutsel', 'quant']) expect(text).toContain(name);
  });
});
