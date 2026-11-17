import { describe, expect, it } from 'vitest';
import { valueOn, type Dated } from './aircraft';

describe('valueOn', () => {
  it('returns undefined for an empty list', () => {
    expect(valueOn([], '2025-01-01')).toBeUndefined();
  });
  it('treats absent bounds as open-ended', () => {
    expect(valueOn([{ value: 'a' }], '1900-01-01')).toBe('a');
    expect(valueOn([{ value: 'a', from: '2020-01-01' }], '2099-12-31')).toBe('a');
    expect(valueOn([{ value: 'a', to: '2020-01-01' }], '1990-01-01')).toBe('a');
  });
  it('has inclusive bounds', () => {
    const p: Dated<string>[] = [{ value: 'a', from: '2020-01-01', to: '2020-12-31' }];
    expect(valueOn(p, '2020-01-01')).toBe('a');
    expect(valueOn(p, '2020-12-31')).toBe('a');
    expect(valueOn(p, '2019-12-31')).toBeUndefined();
    expect(valueOn(p, '2021-01-01')).toBeUndefined();
  });
  it('picks the right period among several and honours gaps', () => {
    const p: Dated<string>[] = [
      { value: 'old', to: '2019-12-31' },
      { value: 'mid', from: '2020-06-01', to: '2020-12-31' },
      { value: 'new', from: '2022-01-01' },
    ];
    expect(valueOn(p, '2019-12-31')).toBe('old');
    expect(valueOn(p, '2020-01-01')).toBeUndefined();
    expect(valueOn(p, '2020-06-01')).toBe('mid');
    expect(valueOn(p, '2021-05-05')).toBeUndefined();
    expect(valueOn(p, '2030-01-01')).toBe('new');
  });
  it('returns the first match when periods overlap', () => {
    const p: Dated<number>[] = [{ value: 1 }, { value: 2 }];
    expect(valueOn(p, '2025-01-01')).toBe(1);
  });
  it('can return falsy values', () => {
    expect(valueOn([{ value: 0 }], '2025-01-01')).toBe(0);
    expect(valueOn([{ value: false }], '2025-01-01')).toBe(false);
  });
});
