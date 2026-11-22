import { describe, expect, it } from 'vitest';
import { columnInfo, customFieldId, sectionColumns } from './columns';

const fields = [
  { id: 'pax', label: 'Passengers', short: 'Pax', kind: 'count' as const },
  { id: 'memo', label: 'Memo', short: 'Memo', kind: 'text' as const },
];

describe('columns', () => {
  it('describes built-in and custom columns', () => {
    expect(columnInfo('pic', [])).toMatchObject({ short: 'PIC', unit: 'minutes' });
    expect(columnInfo('custom:pax', fields)).toMatchObject({ short: 'Pax', unit: 'count' });
    expect(columnInfo('custom:memo', fields)).toBeUndefined();
    expect(columnInfo('custom:gone', fields)).toBeUndefined();
    expect(customFieldId('custom:pax')).toBe('pax');
    expect(customFieldId('total')).toBeUndefined();
  });

  it('offers simulator columns to simulator sections and flight columns to the rest', () => {
    const sim = sectionColumns('simulatorTypes', fields).map((c) => c.id);
    expect(sim).toContain('simulator');
    expect(sim).not.toContain('pic');
    const flight = sectionColumns('types', fields).map((c) => c.id);
    expect(flight).not.toContain('simulator');
    expect(flight).toContain('custom:pax');
    expect(flight).not.toContain('custom:memo');
  });
});
