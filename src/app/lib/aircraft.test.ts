import { describe, expect, it } from 'vitest';
import { makeAirframe, makeType } from '@core/validation/testing';
import { attributeText, byUse, currentTail, periodText, usageText } from './aircraft';

describe('aircraft display', () => {
  it('describes use', () => {
    expect(usageText({ flights: 665, minutes: 79452, sessions: 0, sessionMinutes: 0 })).toBe(
      '1,324.2 h in 665 flights',
    );
    expect(usageText({ flights: 1, minutes: 60, sessions: 2, sessionMinutes: 240 })).toBe(
      '1.0 h in 1 flight · 4.0 h in 2 simulator sessions',
    );
    expect(usageText(undefined)).toBe('Not flown');
  });

  it('lists a type’s attributes', () => {
    expect(
      attributeText(makeType({ multiPilot: true, retractable: true, pressurized: true })),
    ).toBe('Multi-pilot · Retractable gear · Pressurised');
    expect(attributeText(makeType({ complex: false, retractable: false }))).toBe('Fixed gear');
  });

  it('names an airframe by its latest tail and describes periods', () => {
    const f = makeAirframe({ registrations: [{ value: 'N1', to: '2020-01-01' }, { value: 'N2' }] });
    expect(currentTail(f)).toBe('N2');
    expect(periodText('2025-03-10')).toBe('From 2025-03-10');
    expect(periodText(undefined, '2025-03-09')).toBe('Until 2025-03-09');
    expect(periodText('2024-01-01', '2025-03-09')).toBe('2024-01-01 – 2025-03-09');
    expect(periodText()).toBe('');
  });

  it('sorts by use, most first, then by name', () => {
    const use = new Map([
      ['b', { flights: 1, minutes: 60, sessions: 0, sessionMinutes: 0 }],
      ['c', { flights: 1, minutes: 60, sessions: 0, sessionMinutes: 0 }],
      ['d', { flights: 0, minutes: 0, sessions: 1, sessionMinutes: 600 }],
    ]);
    expect(
      byUse(
        ['a', 'c', 'b', 'd'],
        (x) => use.get(x),
        (x) => x,
      ),
    ).toEqual(['d', 'b', 'c', 'a']);
  });
});
