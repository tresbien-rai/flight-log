/**
 * The pilot's own corrections to aircraft and types. See docs/DESIGN.md §4.3.
 *
 * Imported books are replaced on every import, so edits are kept apart from them and applied
 * whenever a book is read. Pure.
 */
import type { AircraftType, Airframe, Dated, Entry, Logbook, TrainingDevice } from '../model';
import { catalogType } from './match';

/** Fields of a type the pilot can change. A type id that is not in the book creates it. */
export type TypeEdit = Partial<Omit<AircraftType, 'id'>>;

export interface AirframeEdit {
  /** Types over time. Replaces the imported history. */
  configurations?: Dated<string>[];
  /**
   * Tails over time. Replaces the imported history. An airframe the import created for one of
   * these tails is folded into this one: its entries move here and it disappears.
   */
  registrations?: Dated<string>[];
  serialNumber?: string;
  overrides?: Airframe['overrides'];
  notes?: string;
}

/** Fields of a training device the pilot can change. */
export interface DeviceEdit extends Partial<Omit<TrainingDevice, 'id'>> {
  /**
   * Another device's id: this one is the same device under another name. Its sessions move
   * there and it disappears.
   */
  mergedInto?: string;
}

export interface AircraftEdits {
  /** By type id. */
  types: Record<string, TypeEdit>;
  /** By airframe id (`af:<tail>`, the tail the import first saw). */
  airframes: Record<string, AirframeEdit>;
  /** By device id (`dev:<name>`). */
  devices: Record<string, DeviceEdit>;
  /**
   * Aircraft the pilot added by hand, by airframe id. When an import later brings the same
   * tail, the imported aircraft is kept and this one's fields apply to it as an edit.
   */
  added: Record<string, Airframe>;
}

export const NO_EDITS: AircraftEdits = { types: {}, airframes: {}, devices: {}, added: {} };

/** Fills in parts an older stored copy does not have. */
export function completeEdits(stored: Partial<AircraftEdits> | undefined): AircraftEdits {
  return {
    types: stored?.types ?? {},
    airframes: stored?.airframes ?? {},
    devices: stored?.devices ?? {},
    added: stored?.added ?? {},
  };
}

/** A type that does not exist yet: from the type list when it is listed, else blank. */
function newType(id: string): AircraftType {
  const listed = catalogType(id);
  if (listed) {
    const { codes, modelPattern, isDefaultForIcao, ...type } = listed;
    void codes;
    void modelPattern;
    void isDefaultForIcao;
    return { ...type };
  }
  return {
    id,
    make: '',
    model: '',
    category: 'airplane',
    class: 'ASEL',
    engine: 'piston',
    complex: false,
    highPerformance: false,
    taa: false,
    pressurized: false,
    retractable: false,
    tailwheel: false,
  };
}

const tailOf = (id: string): string => id.replace(/^af:/, '');

/** Drops keys whose value is undefined, so an edit never writes `undefined` over a value. */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * The book as the pilot has corrected it. Entries move only when an airframe absorbs another
 * through its registrations; nothing else about an entry changes.
 */
export function applyAircraftEdits(logbook: Logbook, edits: AircraftEdits): Logbook {
  const empty = (r: Record<string, unknown> | undefined) => !r || Object.keys(r).length === 0;
  if (empty(edits.types) && empty(edits.airframes) && empty(edits.devices) && empty(edits.added)) {
    return logbook;
  }
  const frameEdits: Record<string, AirframeEdit> = { ...edits.airframes };
  const imported = new Set(logbook.airframes.map((f) => f.id));
  const addedFrames: Airframe[] = [];
  for (const [id, frame] of Object.entries(edits.added ?? {})) {
    if (imported.has(id)) {
      // The import knows this tail now: what the pilot entered still applies, under any edit.
      const { configurations, registrations, serialNumber, overrides, notes } = frame;
      frameEdits[id] = {
        ...defined({ configurations, registrations, serialNumber, overrides, notes }),
        ...frameEdits[id],
      };
    } else {
      addedFrames.push(frame);
    }
  }
  const allFrames = [...logbook.airframes, ...addedFrames];

  // Airframes: apply edits, then fold in airframes whose tail another airframe now claims.
  const byId = new Map(allFrames.map((f) => [f.id, f]));
  const absorbedBy = new Map<string, string>();
  for (const [id, edit] of Object.entries(frameEdits)) {
    if (!byId.has(id) || !edit.registrations) continue;
    for (const r of edit.registrations) {
      const other = `af:${r.value}`;
      if (
        other !== id &&
        byId.has(other) &&
        !absorbedBy.has(other) &&
        !edits.airframes[other]?.registrations
      ) {
        absorbedBy.set(other, id);
      }
    }
  }
  const airframes: Airframe[] = [];
  for (const frame of allFrames) {
    if (absorbedBy.has(frame.id)) continue;
    const edit = frameEdits[frame.id];
    airframes.push(edit ? { ...frame, ...defined(edit) } : frame);
  }

  // Types: edit the ones that exist, create the ones edits or airframes now name.
  const types = new Map(logbook.aircraftTypes.map((t) => [t.id, t]));
  // Devices: apply edits, then fold merged devices into the one they are merged into.
  const deviceEdits = edits.devices ?? {};
  const deviceIds = new Set(logbook.devices.map((d) => d.id));
  const mergedInto = new Map<string, string>();
  for (const [id, edit] of Object.entries(deviceEdits)) {
    const target = edit.mergedInto;
    if (
      deviceIds.has(id) &&
      target &&
      target !== id &&
      deviceIds.has(target) &&
      !deviceEdits[target]?.mergedInto
    ) {
      mergedInto.set(id, target);
    }
  }
  const devices: TrainingDevice[] = logbook.devices
    .filter((d) => !mergedInto.has(d.id))
    .map((d) => {
      const edit = deviceEdits[d.id];
      if (!edit) return d;
      const { mergedInto: _merged, ...fields } = edit;
      void _merged;
      return { ...d, ...defined(fields), id: d.id };
    });

  const needed = new Set<string>(Object.keys(edits.types));
  for (const f of airframes) for (const c of f.configurations) needed.add(c.value);
  for (const d of devices) if (d.represents) needed.add(d.represents);
  for (const id of needed) {
    if (!types.has(id)) types.set(id, newType(id));
  }
  for (const [id, edit] of Object.entries(edits.types)) {
    types.set(id, { ...types.get(id)!, ...defined(edit), id });
  }
  // Keep the book's order, new types after it.
  const aircraftTypes = [
    ...logbook.aircraftTypes.map((t) => types.get(t.id)!),
    ...[...types.values()].filter((t) => !logbook.aircraftTypes.some((x) => x.id === t.id)),
  ];

  const entries: Entry[] =
    absorbedBy.size === 0 && mergedInto.size === 0
      ? logbook.entries
      : logbook.entries.map((e) => {
          const frame = e.airframeId === undefined ? undefined : absorbedBy.get(e.airframeId);
          const device = e.deviceId === undefined ? undefined : mergedInto.get(e.deviceId);
          if (!frame && !device) return e;
          return {
            ...e,
            ...(frame ? { airframeId: frame } : {}),
            ...(device ? { deviceId: device } : {}),
          };
        });

  return { ...logbook, entries, airframes, aircraftTypes, devices };
}

/**
 * A type history with a change on `from`: the type in force the day before ends then, and
 * `typeId` runs from `from` until the next change, if any.
 */
export function withTypeFrom(
  configurations: readonly Dated<string>[],
  typeId: string,
  from: string,
): Dated<string>[] {
  const changes = configurations
    .map((c) => ({ value: c.value, from: c.from }))
    .filter((c) => c.from !== from);
  changes.push({ value: typeId, from });
  return periodsFromChanges(changes);
}

/** `[{value, from?}]` changes, in any order, as back-to-back periods. */
export function periodsFromChanges(
  changes: readonly { value: string; from?: string }[],
): Dated<string>[] {
  const sorted = [...changes].sort((x, y) =>
    x.from === y.from
      ? 0
      : x.from === undefined
        ? -1
        : y.from === undefined
          ? 1
          : x.from < y.from
            ? -1
            : 1,
  );
  // One open start at most; drop a repeat of the same value.
  const out: Dated<string>[] = [];
  for (const c of sorted) {
    const prev = out.at(-1);
    if (prev && prev.value === c.value) continue;
    if (prev && c.from === undefined) continue;
    out.push(c.from === undefined ? { value: c.value } : { value: c.value, from: c.from });
  }
  for (let i = 0; i < out.length - 1; i++) {
    const next = out[i + 1]!.from!;
    out[i] = { ...out[i]!, to: dayBefore(next) };
  }
  return out;
}

function dayBefore(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Parses a pasted fleet conversion list: one airframe per line, a tail and a date
 * (`YYYY-MM-DD`) in either order, separated by spaces, commas or tabs. Returns what could be
 * read and the lines that could not.
 */
export function parseConversionList(text: string): {
  rows: { tail: string; from: string }[];
  rejected: string[];
} {
  const rows: { tail: string; from: string }[] = [];
  const rejected: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const parts = line.split(/[\s,;]+/).filter(Boolean);
    const date = parts.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
    const tail = parts.find((p) => p !== date && /^[A-Z0-9-]{2,10}$/i.test(p));
    if (parts.length === 2 && date && tail && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      rows.push({ tail: tail.toUpperCase(), from: date });
    } else {
      rejected.push(line);
    }
  }
  return { rows, rejected };
}

/** The airframe id the import gives a tail. */
export const airframeIdOf = (tail: string): string => `af:${tail.trim().toUpperCase()}`;
export { tailOf };

/** A new aircraft as the pilot enters it: a tail, a type, and optionally a serial and notes. */
export function newAirframe(
  tail: string,
  typeId: string,
  extra: { serialNumber?: string; notes?: string } = {},
): Airframe {
  const value = tail.trim().toUpperCase();
  return {
    id: airframeIdOf(value),
    registrations: [{ value }],
    configurations: [{ value: typeId }],
    ...defined(extra),
  };
}
