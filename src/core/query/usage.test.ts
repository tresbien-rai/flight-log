import { describe, expect, it } from 'vitest';
import { zeroDurations } from '../model';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '../validation/testing';
import { filterEntries } from './filter';
import { indexLogbook } from './index-logbook';
import { aircraftUsage } from './usage';

const durations = (total: number, simulator = 0) => ({ ...zeroDurations(), total, simulator });

const logbook = makeLogbook({
  aircraftTypes: [makeType({ id: 'CRJ-700' }), makeType({ id: 'CRJ-550' })],
  airframes: [
    makeAirframe({
      id: 'af1',
      registrations: [{ value: 'N1' }],
      configurations: [
        { value: 'CRJ-700', to: '2025-03-09' },
        { value: 'CRJ-550', from: '2025-03-10' },
      ],
    }),
    makeAirframe({
      id: 'af2',
      registrations: [{ value: 'N2' }],
      configurations: [{ value: 'CRJ-700' }],
    }),
  ],
  devices: [{ id: 'dev1', name: 'FFS 1', level: 'FFS', represents: 'CRJ-700' }],
  entries: [
    makeEntry({ id: 'e1', date: '2025-01-01', airframeId: 'af1', durations: durations(60) }),
    makeEntry({ id: 'e2', date: '2025-04-01', airframeId: 'af1', durations: durations(90) }),
    makeEntry({ id: 'e3', date: '2025-02-01', airframeId: 'af2', durations: durations(30) }),
    makeEntry({
      id: 'e4',
      date: '2024-12-01',
      kind: 'simulator',
      airframeId: undefined,
      deviceId: 'dev1',
      durations: durations(0, 240),
    }),
    makeEntry({
      id: 'e5',
      date: '2025-05-01',
      airframeId: 'af2',
      durations: durations(500),
      deletedAt: '2025-06-01T00:00Z',
    }),
  ],
});
const index = indexLogbook(logbook);

describe('aircraftUsage', () => {
  const u = aircraftUsage(logbook.entries, index);

  it('counts a flight under the type its airframe was on that date', () => {
    expect(u.types.get('CRJ-700')).toEqual({
      flights: 2,
      minutes: 90,
      sessions: 1,
      sessionMinutes: 240,
      first: '2024-12-01',
      last: '2025-02-01',
    });
    expect(u.types.get('CRJ-550')).toMatchObject({ flights: 1, minutes: 90, first: '2025-04-01' });
  });

  it('counts per airframe and per device, leaving out deleted entries', () => {
    expect(u.airframes.get('af1')).toMatchObject({ flights: 2, minutes: 150 });
    expect(u.airframes.get('af2')).toMatchObject({ flights: 1, minutes: 30, last: '2025-02-01' });
    expect(u.devices.get('dev1')).toMatchObject({ flights: 0, sessions: 1, sessionMinutes: 240 });
  });
});

describe('filtering by aircraft', () => {
  it('keeps entries flown in the given airframes or devices', () => {
    const ids = (aircraftIds: string[]) =>
      filterEntries(logbook.entries, { aircraftIds }, index).map((e) => e.id);
    expect(ids(['af1'])).toEqual(['e1', 'e2']);
    expect(ids(['af2', 'dev1'])).toEqual(['e3', 'e4']);
    expect(ids([])).toEqual(['e1', 'e2', 'e3', 'e4']);
  });
});
