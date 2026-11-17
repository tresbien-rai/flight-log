/**
 * Build the bundled airport table from OurAirports (public domain).
 *
 *   npm run build:airports
 *
 * Writes src/core/airports/airports.data.json:
 *   { zones: string[], airports: [ident, iata|0, local|0, lat, lon, zoneIndex, name][] }
 * sorted by ident, so the output is deterministic for a given source file.
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import tzLookup from '@photostructure/tz-lookup';
import { parseDelimited } from '../src/core/importers/normalize/delimited';

const SOURCE =
  'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const OUT = new URL('../src/core/airports/airports.data.json', import.meta.url);

const RANK: Record<string, number> = { large_airport: 3, medium_airport: 2, small_airport: 1 };

interface Candidate {
  ident: string;
  iata: string;
  local: string;
  lat: number;
  lon: number;
  tz: string;
  name: string;
  type: string;
  scheduled: boolean;
  id: number;
}

/** True when `a` should win over `b` for the same ident. */
function better(a: Candidate, b: Candidate): boolean {
  const ra = RANK[a.type] ?? 0;
  const rb = RANK[b.type] ?? 0;
  if (ra !== rb) return ra > rb;
  if (a.scheduled !== b.scheduled) return a.scheduled;
  return a.id < b.id;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
const rows = parseDelimited(await res.text(), ',');
const header = rows[0];
if (!header) throw new Error('empty CSV');
const col = (name: string): number => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`missing column ${name}`);
  return i;
};
const C = {
  id: col('id'),
  ident: col('ident'),
  type: col('type'),
  name: col('name'),
  lat: col('latitude_deg'),
  lon: col('longitude_deg'),
  sched: col('scheduled_service'),
  icao: col('icao_code'),
  iata: col('iata_code'),
  gps: col('gps_code'),
  local: col('local_code'),
};

const best = new Map<string, Candidate>();
let considered = 0;
let badCoords = 0;
let duplicatesDropped = 0;

for (const row of rows.slice(1)) {
  const get = (i: number): string => (row[i] ?? '').trim();
  const type = get(C.type);
  if (!(type in RANK)) continue;
  considered++;
  const lat = Number(get(C.lat));
  const lon = Number(get(C.lon));
  if (
    get(C.lat) === '' ||
    get(C.lon) === '' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    badCoords++;
    continue;
  }
  const rawIdent = get(C.ident).toUpperCase();
  const icao = get(C.icao).toUpperCase();
  const gps = get(C.gps).toUpperCase();
  const ident = icao !== '' ? icao : /^[A-Z0-9]{4}$/.test(gps) ? gps : rawIdent;
  if (ident === '') continue;
  const localRaw = get(C.local).toUpperCase();
  const lat4 = Math.round(lat * 1e4) / 1e4;
  const lon4 = Math.round(lon * 1e4) / 1e4;
  let tz: string;
  try {
    tz = tzLookup(lat4, lon4);
  } catch {
    badCoords++;
    continue;
  }
  const cand: Candidate = {
    ident,
    iata: get(C.iata).toUpperCase(),
    local: localRaw !== '' && localRaw !== ident ? localRaw : '',
    lat: lat4,
    lon: lon4,
    tz,
    name: get(C.name),
    type,
    scheduled: get(C.sched) === 'yes',
    id: Number(get(C.id)),
  };
  const prev = best.get(ident);
  if (prev === undefined) best.set(ident, cand);
  else {
    duplicatesDropped++;
    if (better(cand, prev)) best.set(ident, cand);
  }
}

const list = [...best.values()].sort((a, b) =>
  a.ident < b.ident ? -1 : a.ident > b.ident ? 1 : 0,
);
const zones = [...new Set(list.map((a) => a.tz))].sort();
const zoneIndex = new Map(zones.map((z, i) => [z, i]));
const airports = list.map((a) => [
  a.ident,
  a.iata || 0,
  a.local || 0,
  a.lat,
  a.lon,
  zoneIndex.get(a.tz),
  a.name,
]);

const json = JSON.stringify({ zones, airports });
writeFileSync(OUT, json + '\n');

const byType: Record<string, number> = {};
for (const a of best.values()) byType[a.type] = (byType[a.type] ?? 0) + 1;
console.log(`rows considered (airport types): ${considered}`);
console.log(`dropped, bad coordinates: ${badCoords}`);
console.log(`dropped, duplicate idents: ${duplicatesDropped}`);
console.log(`kept: ${list.length} (${zones.length} zones)`);
for (const [t, n] of Object.entries(byType).sort()) console.log(`  ${t}: ${n}`);
console.log(`size: ${json.length} bytes raw, ${gzipSync(json).length} bytes gzipped`);
