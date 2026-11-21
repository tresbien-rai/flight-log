import { describe, expect, it } from 'vitest';
import { personName, writtenName } from './names';

describe('personName', () => {
  it('uses the stored parts in either order', () => {
    const p = { id: 'p', name: 'Pat Example', givenName: 'Pat', familyName: 'Example' };
    expect(personName(p, 'family-first')).toBe('Example, Pat');
    expect(personName(p, 'given-first')).toBe('Pat Example');
  });

  it('parses a record stored before names were split', () => {
    expect(personName({ id: 'p', name: 'Example; Pat' }, 'given-first')).toBe('Pat Example');
    expect(personName({ id: 'p', name: 'Pat Example' }, 'family-first')).toBe('Example, Pat');
  });
});

describe('writtenName', () => {
  it('rewrites an export’s name in the chosen order', () => {
    expect(writtenName('Example; Pat', 'family-first')).toBe('Example, Pat');
    expect(writtenName('Pat Lee Example', 'family-first')).toBe('Example, Pat Lee');
    expect(writtenName('Example, Pat', 'given-first')).toBe('Pat Example');
  });
});
