import { describe, expect, it } from 'vitest';
import { indexLogbook } from '../query';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '../validation/testing';
import { CATALOG } from './catalog';
import {
  applyAircraftEdits,
  completeEdits,
  newAirframe,
  NO_EDITS,
  parseConversionList,
  periodsFromChanges,
  withTypeFrom,
  type AircraftEdits,
} from './edits';
import { silhouetteOf } from './silhouettes';

const book = makeLogbook({
  aircraftTypes: [makeType({ id: 'CRJ-700', make: 'Bombardier' }), makeType({ id: 'C-172S' })],
  airframes: [
    makeAirframe({
      id: 'af:N701',
      registrations: [{ value: 'N701' }],
      configurations: [{ value: 'CRJ-700' }],
    }),
    makeAirframe({
      id: 'af:N799',
      registrations: [{ value: 'N799' }],
      configurations: [{ value: 'CRJ-700' }],
    }),
    makeAirframe({
      id: 'af:N172',
      registrations: [{ value: 'N172' }],
      configurations: [{ value: 'C-172S' }],
    }),
  ],
  entries: [
    makeEntry({ id: 'e1', date: '2025-01-01', airframeId: 'af:N701' }),
    makeEntry({ id: 'e2', date: '2025-06-01', airframeId: 'af:N701' }),
    makeEntry({ id: 'e3', date: '2025-07-01', airframeId: 'af:N799' }),
  ],
});
const edits = (over: Partial<AircraftEdits>): AircraftEdits => ({ ...NO_EDITS, ...over });

describe('applyAircraftEdits', () => {
  it('returns the same book when there is nothing to apply', () => {
    expect(applyAircraftEdits(book, NO_EDITS)).toBe(book);
  });

  it('changes a type’s fields, keeping the rest and its id', () => {
    const out = applyAircraftEdits(
      book,
      edits({
        types: { 'CRJ-700': { notes: 'Line aircraft', multiPilot: true, model: undefined } },
      }),
    );
    const t = out.aircraftTypes.find((x) => x.id === 'CRJ-700')!;
    expect(t).toMatchObject({
      id: 'CRJ-700',
      make: 'Bombardier',
      notes: 'Line aircraft',
      multiPilot: true,
    });
    expect(out.aircraftTypes.map((x) => x.id)).toEqual(['CRJ-700', 'C-172S']);
    expect(book.aircraftTypes[0]!.notes).toBeUndefined();
  });

  it('records a conversion, creating the new type from the type list, and counts flights under it', () => {
    const out = applyAircraftEdits(
      book,
      edits({
        airframes: {
          'af:N701': {
            configurations: withTypeFrom(
              book.airframes[0]!.configurations,
              'CRJ-550',
              '2025-03-10',
            ),
          },
        },
      }),
    );
    expect(out.airframes[0]!.configurations).toEqual([
      { value: 'CRJ-700', to: '2025-03-09' },
      { value: 'CRJ-550', from: '2025-03-10' },
    ]);
    expect(out.aircraftTypes.find((t) => t.id === 'CRJ-550')).toMatchObject({
      variantOf: 'CRJ-700',
      icaoDesignator: 'CRJ7',
    });
    const index = indexLogbook(out);
    expect(out.entries.map((e) => index.typeOf(e)?.id)).toEqual(['CRJ-700', 'CRJ-550', 'CRJ-700']);
  });

  it('creates a blank type for an unlisted id', () => {
    const out = applyAircraftEdits(book, edits({ types: { 'ZZ-1': { make: 'Example' } } }));
    expect(out.aircraftTypes.at(-1)).toMatchObject({
      id: 'ZZ-1',
      make: 'Example',
      engine: 'piston',
    });
  });

  it('folds an airframe into another through a re-registration, moving its entries', () => {
    const out = applyAircraftEdits(
      book,
      edits({
        airframes: {
          'af:N701': {
            registrations: [
              { value: 'N701', to: '2025-06-30' },
              { value: 'N799', from: '2025-07-01' },
            ],
          },
        },
      }),
    );
    expect(out.airframes.map((f) => f.id)).toEqual(['af:N701', 'af:N172']);
    expect(out.entries.map((e) => e.airframeId)).toEqual(['af:N701', 'af:N701', 'af:N701']);
    expect(indexLogbook(out).tailOf(out.entries[2]!)).toBe('N799');
  });

  it('sets serial number, overrides and notes', () => {
    const out = applyAircraftEdits(
      book,
      edits({
        airframes: {
          'af:N172': { serialNumber: '172S1234', overrides: { taa: true }, notes: 'G1000' },
        },
      }),
    );
    expect(out.airframes[2]).toMatchObject({
      serialNumber: '172S1234',
      overrides: { taa: true },
      notes: 'G1000',
    });
  });

  it('ignores edits for airframes the book does not have', () => {
    const out = applyAircraftEdits(book, edits({ airframes: { 'af:NOPE': { notes: 'x' } } }));
    expect(out.airframes).toEqual(book.airframes);
  });
});

describe('type histories', () => {
  it('turns changes into back-to-back periods', () => {
    expect(
      periodsFromChanges([
        { value: 'B', from: '2025-03-10' },
        { value: 'A' },
        { value: 'C', from: '2026-01-01' },
      ]),
    ).toEqual([
      { value: 'A', to: '2025-03-09' },
      { value: 'B', from: '2025-03-10', to: '2025-12-31' },
      { value: 'C', from: '2026-01-01' },
    ]);
  });

  it('drops a change to the type already in force', () => {
    expect(periodsFromChanges([{ value: 'A' }, { value: 'A', from: '2025-01-01' }])).toEqual([
      { value: 'A' },
    ]);
  });

  it('replaces a change on the same date', () => {
    const once = withTypeFrom([{ value: 'A' }], 'B', '2025-03-10');
    expect(withTypeFrom(once, 'C', '2025-03-10')).toEqual([
      { value: 'A', to: '2025-03-09' },
      { value: 'C', from: '2025-03-10' },
    ]);
  });
});

describe('parseConversionList', () => {
  it('reads a tail and a date per line, in either order, and lists what it cannot read', () => {
    expect(
      parseConversionList('N701SK 2025-03-10\n2025-04-01, n702sk\n\nN703SK\nN704SK 10/03/2025'),
    ).toEqual({
      rows: [
        { tail: 'N701SK', from: '2025-03-10' },
        { tail: 'N702SK', from: '2025-04-01' },
      ],
      rejected: ['N703SK', 'N704SK 10/03/2025'],
    });
  });
});

describe('simulators and added aircraft', () => {
  const withDevices = makeLogbook({
    ...book,
    devices: [
      { id: 'dev:C172-AATD', name: 'C172-AATD', level: 'AATD', represents: 'C-172S' },
      { id: 'dev:REDBIRD', name: 'REDBIRD', level: 'AATD' },
    ],
    entries: [
      ...book.entries,
      makeEntry({ id: 's1', kind: 'simulator', airframeId: undefined, deviceId: 'dev:C172-AATD' }),
      makeEntry({ id: 's2', kind: 'simulator', airframeId: undefined, deviceId: 'dev:REDBIRD' }),
    ],
  });

  it('edits a simulator and creates the type it now represents', () => {
    const out = applyAircraftEdits(
      withDevices,
      edits({
        devices: { 'dev:REDBIRD': { name: 'Redbird SD', level: 'BATD', represents: 'CRJ-200' } },
      }),
    );
    expect(out.devices[1]).toEqual({
      id: 'dev:REDBIRD',
      name: 'Redbird SD',
      level: 'BATD',
      represents: 'CRJ-200',
    });
    expect(out.aircraftTypes.some((t) => t.id === 'CRJ-200')).toBe(true);
  });

  it('merges one simulator into another, moving its sessions', () => {
    const out = applyAircraftEdits(
      withDevices,
      edits({
        devices: { 'dev:C172-AATD': { mergedInto: 'dev:REDBIRD', notes: 'ignored once merged' } },
      }),
    );
    expect(out.devices.map((d) => d.id)).toEqual(['dev:REDBIRD']);
    expect(out.entries.filter((e) => e.kind === 'simulator').map((e) => e.deviceId)).toEqual([
      'dev:REDBIRD',
      'dev:REDBIRD',
    ]);
    // A merge into a device that is itself merged away, or into nothing, is ignored.
    const loop = applyAircraftEdits(
      withDevices,
      edits({
        devices: {
          'dev:C172-AATD': { mergedInto: 'dev:REDBIRD' },
          'dev:REDBIRD': { mergedInto: 'dev:C172-AATD' },
        },
      }),
    );
    expect(loop.devices).toHaveLength(2);
  });

  it('adds an aircraft by hand, and folds it into an imported one with the same tail', () => {
    const added = edits({
      added: { 'af:N550': newAirframe(' n550 ', 'CRJ-550', { notes: 'New' }) },
    });
    const out = applyAircraftEdits(book, added);
    expect(out.airframes.at(-1)).toEqual({
      id: 'af:N550',
      registrations: [{ value: 'N550' }],
      configurations: [{ value: 'CRJ-550' }],
      notes: 'New',
    });
    expect(out.aircraftTypes.some((t) => t.id === 'CRJ-550')).toBe(true);

    const later = makeLogbook({
      ...book,
      airframes: [
        ...book.airframes,
        makeAirframe({
          id: 'af:N550',
          registrations: [{ value: 'N550' }],
          configurations: [{ value: 'CRJ-700' }],
        }),
      ],
    });
    const folded = applyAircraftEdits(later, added);
    expect(folded.airframes.filter((f) => f.id === 'af:N550')).toEqual([
      {
        id: 'af:N550',
        registrations: [{ value: 'N550' }],
        configurations: [{ value: 'CRJ-550' }],
        notes: 'New',
      },
    ]);
  });

  it('fills in parts an older stored copy lacks', () => {
    expect(completeEdits({ types: { X: { make: 'Y' } } })).toEqual({
      types: { X: { make: 'Y' } },
      airframes: {},
      devices: {},
      added: {},
    });
    expect(completeEdits(undefined)).toEqual(NO_EDITS);
  });
});

describe('silhouetteOf', () => {
  it('uses the type’s own drawing, else works one out from class and engine', () => {
    expect(silhouetteOf(makeType({ silhouette: 'high-wing-single' }))).toBe('high-wing-single');
    expect(silhouetteOf(makeType({ class: 'helicopter' }))).toBe('helicopter');
    expect(silhouetteOf(makeType({ class: 'AMEL', engine: 'turbofan', multiPilot: true }))).toBe(
      'airliner',
    );
    expect(silhouetteOf(makeType({ class: 'AMEL', engine: 'turbofan' }))).toBe('regional-jet');
    expect(silhouetteOf(makeType({ class: 'AMEL', engine: 'turboprop' }))).toBe('turboprop');
    expect(silhouetteOf(makeType({ class: 'AMEL', engine: 'piston' }))).toBe('light-twin');
    expect(silhouetteOf(makeType({ class: 'ASEL', engine: 'piston' }))).toBe('low-wing-single');
  });

  it('is set for every listed type', () => {
    expect(CATALOG.filter((t) => !t.silhouette).map((t) => t.id)).toEqual([]);
  });
});
