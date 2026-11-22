import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_LAYOUTS,
  completeLayout,
  completeNamedLayouts,
  FULL_LAYOUT,
  showAllRows,
} from './layouts';
import { SECTION_IDS } from './types';

describe('completeLayout', () => {
  it('returns the fallback for anything that is not an object', () => {
    expect(completeLayout(undefined)).toBe(FULL_LAYOUT);
    expect(completeLayout('x')).toBe(FULL_LAYOUT);
  });

  it('gives back a valid layout unchanged', () => {
    for (const { layout } of BUILT_IN_LAYOUTS) expect(completeLayout(layout)).toEqual(layout);
    const ranged = {
      ...FULL_LAYOUT,
      period: { kind: 'range', from: '2024-01-01' },
      asOf: '2025-01-01',
    };
    expect(completeLayout(ranged)).toEqual(ranged);
  });

  it('fills missing parts from the fallback and drops malformed values', () => {
    const layout = completeLayout({
      period: { kind: 'range', from: 'soon', to: '2025-02-30' },
      rules: ['121', 'bogus'],
      rounding: 'sideways',
      lookBacks: [
        { unit: 'days', count: 30 },
        { unit: 'weeks', count: 2 },
        { unit: 'months', count: 0 },
      ],
      sections: { types: { on: false, columns: ['total', 3], hiddenRows: 'x' } },
      asOf: 'today',
    });
    expect(layout.period).toEqual({ kind: 'range' });
    expect(layout.rules).toEqual(['121']);
    expect(layout.rounding).toBe('total');
    expect(layout.lookBacks).toEqual([{ unit: 'days', count: 30 }]);
    expect(layout.sections.types).toEqual({ on: false, columns: ['total'], hiddenRows: [] });
    expect(layout.sections.engine).toEqual(FULL_LAYOUT.sections.engine);
    expect(layout.asOf).toBeUndefined();
    expect(Object.keys(layout.sections)).toEqual([...SECTION_IDS]);
  });
});

describe('completeNamedLayouts', () => {
  it('keeps well-formed layouts and drops the rest', () => {
    const named = completeNamedLayouts([
      { id: 'a', name: 'Insurance', layout: { rounding: 'perFlight' } },
      { id: 'b' },
      7,
    ]);
    expect(named).toHaveLength(1);
    expect(named[0]?.layout.rounding).toBe('perFlight');
    expect(completeNamedLayouts(null)).toEqual([]);
  });
});

describe('showAllRows', () => {
  it('clears every hidden row and nothing else', () => {
    const layout = {
      ...FULL_LAYOUT,
      sections: {
        ...FULL_LAYOUT.sections,
        types: { ...FULL_LAYOUT.sections.types, hiddenRows: ['C-172S'] },
      },
    };
    expect(showAllRows(layout)).toEqual(FULL_LAYOUT);
    expect(layout.sections.types.hiddenRows).toEqual(['C-172S']);
  });
});
