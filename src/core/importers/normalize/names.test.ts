import { describe, expect, it } from 'vitest';
import { formatName, nameKey, parseName } from './names';

describe('parseName', () => {
  it.each([
    ['Example; Pat', 'Pat', 'Example'],
    ['Example, Pat Lee', 'Pat Lee', 'Example'],
    ['  Van  Example ;  Pat ', 'Pat', 'Van Example'],
    ['Pat Example', 'Pat', 'Example'],
    ['Pat Lee Example', 'Pat Lee', 'Example'],
    ['Example', '', 'Example'],
    ['Example;', '', 'Example'],
    ['', '', ''],
  ])('%j', (raw, given, family) => {
    expect(parseName(raw)).toEqual({ given, family });
  });
});

describe('formatName', () => {
  it('writes either order', () => {
    const parts = { given: 'Pat Lee', family: 'Example' };
    expect(formatName(parts, 'family-first')).toBe('Example, Pat Lee');
    expect(formatName(parts, 'given-first')).toBe('Pat Lee Example');
  });

  it('writes a one-part name plainly', () => {
    expect(formatName({ given: '', family: 'Example' }, 'family-first')).toBe('Example');
    expect(formatName({ given: 'Pat', family: '' }, 'family-first')).toBe('Pat');
  });
});

describe('nameKey', () => {
  it('is the same however the name is written', () => {
    const key = nameKey('Example; Pat L.');
    expect(key).toBe('example l pat');
    for (const other of ['Example, Pat L', 'Pat L Example', 'pat  l. EXAMPLE', 'Example Pat L']) {
      expect(nameKey(other)).toBe(key);
    }
  });

  it('tells different people apart', () => {
    expect(nameKey('Pat Example')).not.toBe(nameKey('Pat Sample'));
    expect(nameKey('')).toBe('');
  });
});
