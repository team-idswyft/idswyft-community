import { describe, it, expect } from 'vitest';
import { getMonthStart, getNextMonthStart } from '../timeRanges.js';

describe('getMonthStart', () => {
  it('returns midnight on day 1 of the same month', () => {
    const now = new Date(2026, 4, 7, 14, 30, 45, 123); // 2026-05-07 14:30:45.123
    const start = getMonthStart(now);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4); // May
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('handles January (month index 0) without rolling year', () => {
    const now = new Date(2026, 0, 15);
    const start = getMonthStart(now);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
  });

  it('handles December (month index 11)', () => {
    const now = new Date(2026, 11, 31, 23, 59, 59, 999);
    const start = getMonthStart(now);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(1);
  });

  it('returns same instant when already at month start', () => {
    const now = new Date(2026, 4, 1, 0, 0, 0, 0);
    const start = getMonthStart(now);

    expect(start.getTime()).toBe(now.getTime());
  });

  it('does not mutate the input', () => {
    const now = new Date(2026, 4, 7, 14, 30);
    const before = now.getTime();
    getMonthStart(now);

    expect(now.getTime()).toBe(before);
  });
});

describe('getNextMonthStart', () => {
  it('returns midnight on day 1 of the next month', () => {
    const now = new Date(2026, 4, 7);
    const next = getNextMonthStart(now);

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(5); // June
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
    expect(next.getSeconds()).toBe(0);
    expect(next.getMilliseconds()).toBe(0);
  });

  it('rolls December into January of the following year', () => {
    const now = new Date(2026, 11, 31, 23, 59, 59);
    const next = getNextMonthStart(now);

    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0); // January
    expect(next.getDate()).toBe(1);
  });

  it('works correctly when called on day 1 of the month', () => {
    const now = new Date(2026, 4, 1, 12, 0);
    const next = getNextMonthStart(now);

    expect(next.getMonth()).toBe(5);
    expect(next.getDate()).toBe(1);
  });

  it('produces a strictly greater instant than getMonthStart', () => {
    const now = new Date(2026, 4, 7);

    expect(getNextMonthStart(now).getTime()).toBeGreaterThan(getMonthStart(now).getTime());
  });

  it('does not mutate the input', () => {
    const now = new Date(2026, 4, 7);
    const before = now.getTime();
    getNextMonthStart(now);

    expect(now.getTime()).toBe(before);
  });
});
