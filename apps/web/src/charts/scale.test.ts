import { describe, expect, it } from 'vitest';
import { formatTick, linear, niceTicks } from './scale.ts';

describe('scales', () => {
  it('maps domain to range linearly', () => {
    const x = linear([0, 10], [100, 200]);
    expect(x(0)).toBe(100);
    expect(x(5)).toBe(150);
    expect(linear([3, 3], [0, 1])(3)).toBe(0);
  });

  it('picks round tick steps', () => {
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(0, 200)).toEqual([0, 50, 100, 150, 200]);
    expect(niceTicks(0, 0.5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(niceTicks(0, 37)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('formats compact tick labels', () => {
    expect(formatTick(0.30000000000000004)).toBe('0.3');
    expect(formatTick(1500)).toBe('1.5K');
    expect(formatTick(250)).toBe('250');
  });
});
