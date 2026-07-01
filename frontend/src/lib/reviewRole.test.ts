import { describe, it, expect } from 'vitest';
import { deriveReviewRole } from './reviewRole';

describe('deriveReviewRole', () => {
  it('operator wins regardless of admin probes', () => {
    expect(deriveReviewRole({ isOperator: true, analyticsOk: false, developersOk: false })).toBe('operator');
  });
  it('platform when developers list is reachable', () => {
    expect(deriveReviewRole({ isOperator: false, analyticsOk: true, developersOk: true })).toBe('platform');
  });
  it('admin when analytics ok but not developers', () => {
    expect(deriveReviewRole({ isOperator: false, analyticsOk: true, developersOk: false })).toBe('admin');
  });
  it('reviewer otherwise', () => {
    expect(deriveReviewRole({ isOperator: false, analyticsOk: false, developersOk: false })).toBe('reviewer');
  });
});
