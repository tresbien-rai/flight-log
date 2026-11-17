import { describe, expect, it } from 'vitest';
import { createContext } from './context';
import { sortEntries, validate } from './engine';
import { ALL_RULES } from './rules';
import { lookup, makeAirframe, makeEntry, makeLogbook, makeType } from './testing';
import type { EntryRule, LogbookRule, Rule } from './types';

const entryRule = (id: string, hit: (e: { id: string }) => boolean = () => true): EntryRule => ({
  id,
  title: id,
  description: id,
  scope: 'entry',
  check: (e) =>
    hit(e)
      ? [{ ruleId: id, severity: 'note', entryIds: [e.id], fields: [], message: `${id} ${e.id}` }]
      : [],
});

describe('sortEntries', () => {
  it('sorts by date then out, with entries lacking out after those with, stably', () => {
    const list = [
      makeEntry({ id: 'n1', date: '2025-06-22' }),
      makeEntry({ id: 'late', date: '2025-06-22', out: '2025-06-22T15:00Z' }),
      makeEntry({ id: 'n2', date: '2025-06-22' }),
      makeEntry({ id: 'early', date: '2025-06-22', out: '2025-06-22T09:00Z' }),
      makeEntry({ id: 'prev', date: '2025-06-21' }),
    ];
    expect(sortEntries(list).map((e) => e.id)).toEqual(['prev', 'early', 'late', 'n1', 'n2']);
  });
  it('compares out as instants, not strings', () => {
    const list = [
      makeEntry({ id: 'b', out: '2025-06-22T10:00:00Z' }),
      makeEntry({ id: 'a', out: '2025-06-22T09:59Z' }),
    ];
    expect(sortEntries(list).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('validate', () => {
  it('skips deleted entries', () => {
    const lb = makeLogbook({
      entries: [makeEntry({ id: 'x', deletedAt: '2025-07-01T00:00Z' }), makeEntry({ id: 'y' })],
    });
    expect(validate(lb, {}, [entryRule('r')]).map((f) => f.entryIds[0])).toEqual(['y']);
  });

  it('gives logbook rules active entries sorted by date then out', () => {
    let seen: string[] = [];
    const rule: LogbookRule = {
      id: 'spy',
      title: 's',
      description: 's',
      scope: 'logbook',
      check: (entries) => {
        seen = entries.map((e) => e.id);
        return [];
      },
    };
    const lb = makeLogbook({
      entries: [
        makeEntry({ id: 'c', date: '2025-06-23' }),
        makeEntry({ id: 'del', deletedAt: '2025-07-01T00:00Z' }),
        makeEntry({ id: 'b', out: '2025-06-22T12:00Z' }),
        makeEntry({ id: 'a', out: '2025-06-22T08:00Z' }),
      ],
    });
    validate(lb, {}, [rule]);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('drops findings from disabled rules, and does not run them', () => {
    let ran = false;
    const spy: EntryRule = { ...entryRule('spy'), check: () => ((ran = true), []) };
    const lb = makeLogbook({ entries: [makeEntry()] });
    const found = validate(lb, { disabled: ['spy', 'a'] }, [spy, entryRule('a'), entryRule('b')]);
    expect(found.map((f) => f.ruleId)).toEqual(['b']);
    expect(ran).toBe(false);
  });

  it('drops a finding only when every entry it names has acknowledged the rule', () => {
    const pair: LogbookRule = {
      id: 'pair',
      title: 'p',
      description: 'p',
      scope: 'logbook',
      check: (entries) => [
        {
          ruleId: 'pair',
          severity: 'warning',
          entryIds: entries.map((e) => e.id),
          fields: [],
          message: 'm',
        },
      ],
    };
    const both = makeLogbook({
      entries: [
        makeEntry({ id: 'a', acknowledged: ['pair'] }),
        makeEntry({ id: 'b', acknowledged: ['pair'] }),
      ],
    });
    expect(validate(both, {}, [pair])).toEqual([]);
    const one = makeLogbook({
      entries: [makeEntry({ id: 'a', acknowledged: ['pair'] }), makeEntry({ id: 'b' })],
    });
    expect(validate(one, {}, [pair])).toHaveLength(1);
    const other = makeLogbook({ entries: [makeEntry({ id: 'a', acknowledged: ['different'] })] });
    expect(validate(other, {}, [entryRule('r')])).toHaveLength(1);
  });

  it('never drops findings that name no entries as acknowledged', () => {
    const global: LogbookRule = {
      id: 'global',
      title: 'g',
      description: 'g',
      scope: 'logbook',
      check: () => [{ ruleId: 'global', severity: 'note', entryIds: [], fields: [], message: 'm' }],
    };
    const lb = makeLogbook({ entries: [makeEntry({ acknowledged: ['global'] })] });
    expect(validate(lb, {}, [global])).toHaveLength(1);
  });

  it('sorts by first entry date, then entry id, then rule id', () => {
    const lb = makeLogbook({
      entries: [
        makeEntry({ id: 'z', date: '2025-06-20' }),
        makeEntry({ id: 'b', date: '2025-06-22' }),
        makeEntry({ id: 'a', date: '2025-06-22' }),
      ],
    });
    const found = validate(lb, {}, [entryRule('r2'), entryRule('r1')]);
    expect(found.map((f) => `${f.entryIds[0]}:${f.ruleId}`)).toEqual([
      'z:r1',
      'z:r2',
      'a:r1',
      'a:r2',
      'b:r1',
      'b:r2',
    ]);
  });

  it('puts findings that name no entries last', () => {
    const global: LogbookRule = {
      id: 'global',
      title: 'g',
      description: 'g',
      scope: 'logbook',
      check: () => [{ ruleId: 'global', severity: 'note', entryIds: [], fields: [], message: 'm' }],
    };
    const lb = makeLogbook({ entries: [makeEntry()] });
    expect(validate(lb, {}, [global, entryRule('r')]).map((f) => f.ruleId)).toEqual([
      'r',
      'global',
    ]);
  });

  it('turns a throwing rule into a rule-crashed error and keeps going', () => {
    const boom: EntryRule = {
      id: 'boom',
      title: 'b',
      description: 'b',
      scope: 'entry',
      check: (e) => {
        if (e.id === 'bad') throw new Error('kaput');
        return [];
      },
    };
    const boomBook: LogbookRule = {
      id: 'boom-book',
      title: 'b',
      description: 'b',
      scope: 'logbook',
      check: () => {
        throw 'string failure';
      },
    };
    const lb = makeLogbook({ entries: [makeEntry({ id: 'bad' }), makeEntry({ id: 'ok' })] });
    const found = validate(lb, {}, [boom, boomBook, entryRule('fine')]);
    const crashes = found.filter((f) => f.ruleId === 'rule-crashed');
    expect(crashes).toHaveLength(2);
    expect(crashes.every((c) => c.severity === 'error')).toBe(true);
    expect(crashes.find((c) => c.entryIds[0] === 'bad')!.message).toContain('boom');
    expect(crashes.find((c) => c.entryIds[0] === 'bad')!.message).toContain('kaput');
    expect(crashes.find((c) => c.entryIds.length === 0)!.message).toContain('boom-book');
    expect(found.filter((f) => f.ruleId === 'fine')).toHaveLength(2);
  });

  it('does not mutate its input', () => {
    const lb = makeLogbook({
      entries: [makeEntry({ id: 'b', date: '2025-06-23' }), makeEntry({ id: 'a' })],
    });
    const before = JSON.stringify(lb);
    validate(lb, { airports: lookup });
    expect(JSON.stringify(lb)).toBe(before);
  });

  it('uses ALL_RULES by default, with unique ids and descriptions', () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ALL_RULES) {
      expect(r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.description).toMatch(/\.$/);
    }
    const lb = makeLogbook({ entries: [makeEntry({ durations: { night: 600 } })] });
    expect(validate(lb).some((f) => f.ruleId === 'component-exceeds-total')).toBe(true);
  });
});

describe('real-world shapes stay quiet under every rule', () => {
  const rules: readonly Rule[] = ALL_RULES;
  const base = makeLogbook({
    airframes: [makeAirframe({ id: 'crj', configurations: [{ value: 'crj' }] }), makeAirframe()],
    aircraftTypes: [makeType(), makeType({ id: 'crj', engine: 'turbofan' })],
  });
  const quiet = (entries: ReturnType<typeof makeEntry>[]) =>
    validate({ ...base, entries }, { airports: lookup }, rules).filter(
      (f) => f.severity !== 'note',
    );

  it('PIC with dual received, and PIC with dual given, may exceed total', () => {
    const received = makeEntry({
      id: 'r',
      durations: { pic: 60, dualReceived: 60 },
      crew: [{ personId: 'p', role: 'instructor' }],
    });
    const given = makeEntry({ id: 'g', date: '2025-06-23', durations: { pic: 60, dualGiven: 60 } });
    expect(quiet([received, given])).toEqual([]);
  });
  it('an airline pilot monitoring logs zero takeoffs and landings', () => {
    const pm = makeEntry({
      rule: '121',
      airframeId: 'crj',
      pilotFlying: false,
      dayTakeoffs: 0,
      landings: { dayFullStop: 0 },
      out: '2025-06-22T10:00Z',
      in: '2025-06-22T11:00Z',
      totalSource: 'block',
    });
    expect(quiet([pm])).toEqual([]);
  });
  it('a simulator session has simulator time, approaches, holds and no airports', () => {
    const sim = makeEntry({
      kind: 'simulator',
      deviceId: 'd1',
      airframeId: undefined,
      from: undefined,
      to: undefined,
      dayTakeoffs: 0,
      landings: { dayFullStop: 0 },
      durations: { total: 0, pic: 0, simulator: 120, simulatedInstrument: 100 },
      approaches: [{ type: 'ILS' }],
      holds: 2,
    });
    expect(validate({ ...base, entries: [sim] }, { airports: lookup }, rules)).toEqual([]);
  });
  it('a ground entry carries only ground training', () => {
    const ground = makeEntry({
      kind: 'ground',
      airframeId: undefined,
      from: undefined,
      to: undefined,
      dayTakeoffs: 0,
      landings: { dayFullStop: 0 },
      durations: { total: 0, pic: 0, groundTraining: 60 },
    });
    expect(validate({ ...base, entries: [ground] }, { airports: lookup }, rules)).toEqual([]);
  });
  it('cross-country on a round trip that landed elsewhere is fine', () => {
    const rt = makeEntry({
      from: 'KAAA',
      to: 'KAAA',
      durations: { crossCountry: 60, crossCountry50: 60 },
      dayTakeoffs: 2,
      landings: { dayFullStop: 2 },
    });
    expect(quiet([rt])).toEqual([]);
  });
});

describe('performance', () => {
  it('validates 2,000 entries well under a second', () => {
    const entries = Array.from({ length: 2000 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
      const hour = String(i % 20).padStart(2, '0');
      return makeEntry({
        id: `e${i}`,
        date: `2020-${month}-${day}`,
        out: `2020-${month}-${day}T${hour}:00Z`,
        in: `2020-${month}-${day}T${hour}:50Z`,
        off: `2020-${month}-${day}T${hour}:05Z`,
        on: `2020-${month}-${day}T${hour}:45Z`,
        durations: { total: 50, pic: 50 },
      });
    });
    const lb = makeLogbook({ entries });
    const start = performance.now();
    const found = validate(lb, { airports: lookup });
    const ms = performance.now() - start;
    expect(found).toBeInstanceOf(Array);
    expect(ms).toBeLessThan(800);
  });
});

describe('createContext', () => {
  const lb = makeLogbook({
    airframes: [
      makeAirframe({
        configurations: [
          { value: 't1', to: '2024-12-31' },
          { value: 't2', from: '2025-01-01' },
        ],
      }),
    ],
    aircraftTypes: [
      makeType(),
      makeType({ id: 't2', engine: 'turboprop' }),
      makeType({ id: 't3' }),
    ],
  });
  const ctx = createContext(lb, { airports: lookup });

  it('exposes the logbook and airports', () => {
    expect(ctx.logbook).toBe(lb);
    expect(ctx.airports).toBe(lookup);
    expect(createContext(lb).airports).toBeUndefined();
  });
  it('finds airframes and devices by id', () => {
    expect(ctx.airframeOf(makeEntry())?.id).toBe('a1');
    expect(ctx.airframeOf(makeEntry({ airframeId: 'zz' }))).toBeUndefined();
    expect(ctx.airframeOf(makeEntry({ airframeId: undefined }))).toBeUndefined();
    expect(ctx.deviceOf(makeEntry({ deviceId: 'd1' }))?.id).toBe('d1');
    expect(ctx.deviceOf(makeEntry({ deviceId: 'zz' }))).toBeUndefined();
    expect(ctx.deviceOf(makeEntry())).toBeUndefined();
  });
  it('resolves the type in force on the entry date', () => {
    expect(ctx.typeOf(makeEntry({ date: '2024-12-31' }))?.id).toBe('t1');
    expect(ctx.typeOf(makeEntry({ date: '2025-01-01' }))?.id).toBe('t2');
  });
  it('lets typeOverride win, even when the override is unknown', () => {
    expect(ctx.typeOf(makeEntry({ typeOverride: 't3' }))?.id).toBe('t3');
    expect(ctx.typeOf(makeEntry({ typeOverride: 'nope' }))).toBeUndefined();
  });
  it('is undefined with no airframe, no covering configuration, or a dangling type id', () => {
    expect(ctx.typeOf(makeEntry({ airframeId: undefined }))).toBeUndefined();
    const gap = createContext(
      makeLogbook({
        airframes: [makeAirframe({ configurations: [{ value: 't1', from: '2030-01-01' }] })],
      }),
    );
    expect(gap.typeOf(makeEntry())).toBeUndefined();
    const dangling = createContext(
      makeLogbook({ airframes: [makeAirframe({ configurations: [{ value: 'gone' }] })] }),
    );
    expect(dangling.typeOf(makeEntry())).toBeUndefined();
  });
});
