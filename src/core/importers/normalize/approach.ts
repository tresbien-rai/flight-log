/** Parsing of the `count;type;runway;airport[;comment[;remark]]` approach cell. */

import type { Approach, ApproachType } from '../../model';
import { clean, normalizeAirport, parseCount } from './text';

// Order matters: first match wins.
const RULES: readonly (readonly [RegExp, ApproachType])[] = [
  [/^(CONTACT|VISUAL)(?![A-Z])/, 'VISUAL'],
  [/^ILS(?![A-Z])/, 'ILS'],
  [/^(LOC|LOCALIZER)(?![A-Z])/, 'LOC'], // refined to LOC-BC below
  [/^LDA(?![A-Z])/, 'LDA'],
  [/^SDF(?![A-Z])/, 'SDF'],
  [/^RNAV\s*\(\s*RNP\s*\)/, 'RNAV-RNP'],
  [/^RNP(?![A-Z])/, 'RNAV-RNP'],
  [/^RNAV\s*\(\s*GPS\s*\)/, 'RNAV-GPS'],
  [/^GPS(?![A-Z])/, 'RNAV-GPS'],
  [/^RNAV(?![A-Z])/, 'RNAV-GPS'],
  [/^GLS(?![A-Z])/, 'GLS'],
  [/^VOR(?![A-Z])/, 'VOR'],
  [/^NDB(?![A-Z])/, 'NDB'],
  [/^TACAN(?![A-Z])/, 'TACAN'],
  [/^PAR(?![A-Z])/, 'PAR'],
  [/^ASR(?![A-Z])/, 'ASR'],
];

/** Plain names that are not worth echoing into `note`. */
const SHORT_NAMES = new Set([
  'ILS',
  'LOC',
  'LOC/DME',
  'LOC BC',
  'LOC/DME BC',
  'LOC-BC',
  'LDA',
  'SDF',
  'RNAV (GPS)',
  'RNAV-GPS',
  'GPS',
  'RNAV',
  'RNAV (RNP)',
  'RNAV-RNP',
  'RNP',
  'GLS',
  'VOR',
  'VOR/DME',
  'NDB',
  'NDB/DME',
  'TACAN',
  'PAR',
  'ASR',
  'VISUAL',
  'CONTACT',
]);

function canon(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Free text (short name or chart title) to an approach type; undefined if unrecognised. */
export function normalizeApproachType(s: string): ApproachType | undefined {
  const u = canon(s);
  for (const [re, type] of RULES) {
    if (!re.test(u)) continue;
    if (type === 'LOC' && (/\bBC\b/.test(u) || u.includes('BACK COURSE'))) return 'LOC-BC';
    return type;
  }
  return undefined;
}

/** `6` -> `06`, `rwy 7l` -> `07L`. Numbers 01-36 with optional L/C/R only. */
export function normalizeRunway(s: string): string | undefined {
  const u = canon(s).replace(/^(?:RWY|RUNWAY)\s*/, '');
  const m = /^(\d{1,2})\s*([LCR])?$/.exec(u);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (n < 1 || n > 36) return undefined;
  return String(n).padStart(2, '0') + (m[2] ?? '');
}

export interface ParsedApproach {
  count: number;
  approach: Approach;
  problems: string[];
}

export function parseApproachCell(cell: string): ParsedApproach | undefined {
  const fields = cell.split(';').map((f) => clean(f));
  if (fields.every((f) => f === undefined)) return undefined;

  const [countText, typeText, runwayField, airportField, ...extras] = fields;
  const problems: string[] = [];
  const notes: string[] = [];

  let count = parseCount(countText);
  if (count === undefined || count < 1) {
    count = 1;
    problems.push('bad-count');
  }

  let runwayText = runwayField;
  let airportText = airportField;
  // Position-shifted form: `1;;KSEA` has the airport where the runway belongs.
  if (
    typeText === undefined &&
    runwayText !== undefined &&
    airportText === undefined &&
    normalizeRunway(runwayText) === undefined
  ) {
    airportText = runwayText;
    runwayText = undefined;
  }

  let type: ApproachType = 'OTHER';
  if (typeText !== undefined) {
    const t = normalizeApproachType(typeText);
    if (t === undefined) {
      problems.push('unknown-approach-type');
      notes.push(typeText);
    } else {
      type = t;
      if (!SHORT_NAMES.has(canon(typeText))) notes.push(typeText);
    }
  } else {
    problems.push('unknown-approach-type');
  }

  let runway: string | undefined;
  let circlingOnly = false;
  if (runwayText !== undefined) {
    runway = normalizeRunway(runwayText);
    if (runway === undefined) {
      const variant = /^([A-Z])(?:\s+(.+))?$/i.exec(runwayText);
      const rest = variant?.[2] === undefined ? undefined : normalizeRunway(variant[2]);
      if (variant && variant[2] === undefined) {
        // A lone letter is a circling-only procedure (`VOR-A`): it has no runway.
        circlingOnly = true;
        notes.push(`-${variant[1]!.toUpperCase()}`);
      } else if (rest !== undefined) {
        // A procedure variant letter before the runway (`Z 24`).
        runway = rest;
        notes.push(runwayText);
      } else {
        problems.push('bad-runway');
        notes.push(runwayText);
      }
    }
  } else if (typeText !== undefined) {
    const m = /\bRWY\s*(\d{1,2}\s*[LCR]?)(?![A-Z0-9])/i.exec(typeText);
    if (m) runway = normalizeRunway(m[1]!);
  }

  const approach: Approach = { type };
  if (runway !== undefined) approach.runway = runway;
  if (circlingOnly) approach.circleToLand = true;
  const ident = normalizeAirport(airportText).ident;
  if (ident !== undefined) approach.airport = ident;

  for (const extra of extras) {
    if (extra === undefined) continue;
    const u = extra.toUpperCase();
    if (u === 'CIRCLE') approach.circleToLand = true;
    else if (u === 'MISSED') approach.missed = true;
    else notes.push(extra);
  }
  if (notes.length > 0) approach.note = notes.join('; ');

  return { count, approach, problems };
}
