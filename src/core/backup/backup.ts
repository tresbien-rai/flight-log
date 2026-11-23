/**
 * Writing and reading the backup file. Pure. See `types.ts` for the shape.
 */
import { completeEdits } from '../aircraft';
import type { SourceId } from '../importers';
import { decisionKey, type Decision } from '../reconcile';
import { migrate } from './migrate';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type Backup,
  type BackupBook,
  type BackupContents,
  type BackupParse,
  type BackupSource,
  type BackupSummary,
} from './types';

const SOURCE_ORDER: readonly SourceId[] = ['logten', 'foreflight'];
const DECISION_KINDS = new Set(['pair', 'orphan', 'bulk', 'rule']);
const LOGBOOK_PARTS = ['entries', 'airframes', 'aircraftTypes', 'devices', 'people'] as const;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The backup of these contents. Sources and decisions are put in a fixed order, so the same
 * data always gives the same file apart from `createdAt`.
 */
export function toBackup(contents: BackupContents, createdAt: string): Backup {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    sources: [...contents.sources].sort(
      (a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source),
    ),
    decisions: contents.decisions
      .map((decision) => ({ key: decisionKey(decision), decision }))
      .sort((a, b) => compare(a.key, b.key))
      .map((keyed) => keyed.decision),
    aircraftEdits: contents.aircraftEdits,
    documents: contents.documents,
    settings: contents.settings,
  };
  if (contents.main) backup.main = contents.main;
  return backup;
}

/** The file's text. */
export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup);
}

/** `flight-log-backup-2026-11-23.json`, from the backup's own date (UTC). */
export function backupFileName(backup: Pick<Backup, 'createdAt'>): string {
  return `${BACKUP_FORMAT}-${backup.createdAt.slice(0, 10)}.json`;
}

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

/** Thrown inside `parseBackup` to name the part that is wrong. */
class Damaged extends Error {}

function readSources(value: unknown): BackupSource[] {
  if (!Array.isArray(value)) throw new Damaged('The list of export files is missing.');
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (
      !isRecord(item) ||
      !SOURCE_ORDER.includes(item.source as SourceId) ||
      !isString(item.fileName) ||
      !isString(item.text) ||
      !isString(item.importedAt)
    ) {
      throw new Damaged('One of the export files is incomplete.');
    }
    if (seen.has(item.source as string)) {
      throw new Damaged(`There are two ${item.source as string} export files.`);
    }
    seen.add(item.source as string);
    return item as unknown as BackupSource;
  });
}

function readDecisions(value: unknown): Decision[] {
  if (!Array.isArray(value)) throw new Damaged('The list of audit decisions is missing.');
  return value.map((item: unknown) => {
    if (!isRecord(item) || !DECISION_KINDS.has(item.kind as string) || !isString(item.decidedAt)) {
      throw new Damaged('One of the audit decisions is not a decision.');
    }
    return item as unknown as Decision;
  });
}

function readMain(value: unknown): BackupBook {
  if (!isRecord(value) || !isRecord(value.logbook) || !isString(value.updatedAt)) {
    throw new Damaged('The merged logbook is incomplete.');
  }
  const logbook = value.logbook;
  for (const part of LOGBOOK_PARTS) {
    const rows = logbook[part];
    if (!Array.isArray(rows) || !rows.every((row) => isRecord(row) && isString(row.id))) {
      throw new Damaged(`The merged logbook's ${part} are missing or incomplete.`);
    }
  }
  if (!(logbook.entries as Json[]).every((entry) => isString(entry.date))) {
    throw new Damaged('An entry in the merged logbook has no date.');
  }
  return {
    logbook: logbook as unknown as BackupBook['logbook'],
    updatedAt: value.updatedAt,
    issues: Array.isArray(value.issues) ? (value.issues as BackupBook['issues']) : [],
    notes: Array.isArray(value.notes) ? (value.notes as BackupBook['notes']) : [],
  };
}

/**
 * Reads a backup file's text, migrating an older version. Checks the shape far enough that a
 * restore cannot fail half-way on it; it does not re-validate every field of every entry.
 */
export function parseBackup(text: string): BackupParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json', message: 'The file is not a Flight Log backup.' };
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, reason: 'not-a-backup', message: 'The file is not a Flight Log backup.' };
  }
  const version = parsed.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      ok: false,
      reason: 'damaged',
      message: 'The backup does not say which version it is.',
    };
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: 'newer',
      message: `The backup was written by a newer version of Flight Log (backup version ${version}; this app reads up to ${BACKUP_VERSION}).`,
    };
  }
  try {
    const current = migrate(parsed, version);
    if (!isString(current.createdAt)) throw new Damaged('The backup has no date.');
    if (!isRecord(current.aircraftEdits)) throw new Damaged('The aircraft edits are missing.');
    const backup: Backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: current.createdAt,
      sources: readSources(current.sources),
      decisions: readDecisions(current.decisions),
      aircraftEdits: completeEdits(current.aircraftEdits),
      documents: isRecord(current.documents) ? current.documents : {},
      settings: isRecord(current.settings) ? current.settings : {},
    };
    if (current.main !== undefined) backup.main = readMain(current.main);
    return { ok: true, backup };
  } catch (error) {
    return {
      ok: false,
      reason: 'damaged',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** What a backup, or the device, holds, as counts. */
export function summarizeBackup(contents: BackupContents): BackupSummary {
  const edits = contents.aircraftEdits;
  return {
    sources: contents.sources.map(({ source, fileName, importedAt }) => ({
      source,
      fileName,
      importedAt,
    })),
    decisions: contents.decisions.length,
    mainEntries: contents.main?.logbook.entries.filter((e) => e.deletedAt === undefined).length,
    aircraftEdits:
      Object.keys(edits.types).length +
      Object.keys(edits.airframes).length +
      Object.keys(edits.devices).length +
      Object.keys(edits.added).length,
    documents: Object.keys(contents.documents).sort(),
  };
}

/** True when there is nothing a restore would overwrite. */
export function isEmptySummary(summary: BackupSummary): boolean {
  return (
    summary.sources.length === 0 &&
    summary.decisions === 0 &&
    summary.mainEntries === undefined &&
    summary.aircraftEdits === 0 &&
    summary.documents.length === 0
  );
}
