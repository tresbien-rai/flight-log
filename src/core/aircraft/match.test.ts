import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { inEngineBucket } from './engines';
import { catalogType, matchType } from './match';

const id = (typeCode: string, model?: string) => matchType({ typeCode, model })?.id;

describe('matchType', () => {
  it('maps both apps’ spellings of the same aircraft onto one type', () => {
    // LogTen writes the model, ForeFlight the ICAO designator plus a model text.
    expect(id('C-172S')).toBe('C-172S');
    expect(id('C172', '172S Skyhawk')).toBe('C-172S');
    expect(id('C172', '172R Skyhawk')).toBe('C-172R');
    expect(id('C-172RG')).toBe('C-172RG');
    expect(id('C72R', '172RG Cutlass RG')).toBe('C-172RG');
    expect(id('C182', '182T Skylane')).toBe('C-182T');
    expect(id('PA-28A-161')).toBe('PA-28-161');
    expect(id('P28A', 'PA-28-161 Warrior II')).toBe('PA-28-161');
    expect(id('P28A', 'PA-28-181 Archer II')).toBe('PA-28-181');
    expect(id('P28R', 'PA-28-201 Arrow III')).toBe('PA-28R-201');
    expect(id('P28R', 'PA-28R-200 Arrow II')).toBe('PA-28R-200');
    expect(id('BE76', '76 Duchess')).toBe('BE76');
    expect(id('PIAT')).toBe('PIAT');
  });

  it('tells the CRJ variants apart, and assumes the original type when unsure', () => {
    expect(id('CRJ7', 'CL-600 Regional Jet CRJ-700')).toBe('CRJ-700');
    expect(id('CRJ7', 'CRJ700NG')).toBe('CRJ-700');
    expect(id('CRJ7', 'CRJ 550')).toBe('CRJ-550');
    expect(id('CRJ7')).toBe('CRJ-700');
    expect(id('CRJ2', 'CRJ 200LR')).toBe('CRJ-200');
    expect(id('CRJ9', 'CRJ 900')).toBe('CRJ-900');
    expect(id('CRJ-550')).toBe('CRJ-550');
  });

  it('leaves an ICAO designator unmatched when the model does not say and there is no default', () => {
    expect(id('C172')).toBeUndefined();
    expect(id('C172', 'Skyhawk')).toBeUndefined();
  });

  it('knows nothing of unlisted types', () => {
    expect(id('ZZ01')).toBeUndefined();
    expect(id('')).toBeUndefined();
    expect(matchType({})).toBeUndefined();
  });
});

describe('the type list', () => {
  it('has unique ids, and every variant points at a listed parent with the same designator', () => {
    const ids = CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of CATALOG.filter((x) => x.variantOf)) {
      expect(catalogType(t.variantOf!)?.icaoDesignator).toBe(t.icaoDesignator);
    }
  });

  it('gives each shared designator at most one default', () => {
    const defaults = new Map<string, number>();
    for (const t of CATALOG.filter((x) => x.isDefaultForIcao)) {
      defaults.set(t.icaoDesignator, (defaults.get(t.icaoDesignator) ?? 0) + 1);
    }
    expect([...defaults.values()].every((n) => n === 1)).toBe(true);
  });
});

describe('engine buckets', () => {
  it('counts turbofans as turbojet-powered, and every turbine as turbine', () => {
    expect(inEngineBucket('turbofan', 'turbojet-powered')).toBe(true);
    expect(inEngineBucket('turbojet', 'turbojet-powered')).toBe(true);
    expect(inEngineBucket('turboprop', 'turbojet-powered')).toBe(false);
    expect(inEngineBucket('turboprop', 'turbine')).toBe(true);
    expect(inEngineBucket('turboshaft', 'turbine')).toBe(true);
    expect(inEngineBucket('piston', 'turbine')).toBe(false);
    expect(inEngineBucket('piston', 'piston')).toBe(true);
  });
});
