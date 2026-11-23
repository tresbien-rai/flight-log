/**
 * The backup file: everything on a device that cannot be rebuilt from something else, in one
 * JSON document. See docs/DESIGN.md §3.3.
 *
 * The two imported books are deliberately absent. They are rebuilt on restore by importing the
 * stored export files again, which is exactly what the Import screen does.
 *
 * The file carries a schema version. A change to this shape needs a new version, a migration in
 * `migrate.ts` and a saved sample of the old version in the tests.
 */
import type { AircraftEdits } from '../aircraft';
import type { ConversionNote, ImportIssue, SourceId } from '../importers';
import type { Logbook } from '../model';
import type { Decision } from '../reconcile';

/** Marks a JSON file as one of ours, whatever it is called. */
export const BACKUP_FORMAT = 'flight-log-backup';

/** The version this code writes. Older versions are migrated on reading. */
export const BACKUP_VERSION = 1;

/** An export file exactly as it was imported. */
export interface BackupSource {
  source: SourceId;
  fileName: string;
  text: string;
  /** UTC ISO instant. */
  importedAt: string;
}

/** The pilot's own merged logbook with what is known about how it was built. */
export interface BackupBook {
  logbook: Logbook;
  /** UTC ISO instant. */
  updatedAt: string;
  issues: ImportIssue[];
  notes: ConversionNote[];
}

/** What a backup holds, apart from its envelope. */
export interface BackupContents {
  /** At most one per source, in `SourceId` order. */
  sources: BackupSource[];
  /** Every audit decision, ordered by `decisionKey`. */
  decisions: Decision[];
  aircraftEdits: AircraftEdits;
  /** The pilot's own documents by name (`reportLayouts`, `pilot`), as stored. */
  documents: Record<string, unknown>;
  /** The few settings worth keeping, by key. */
  settings: Record<string, unknown>;
  /** Absent until "Build my logbook" has been used. */
  main?: BackupBook;
}

export interface Backup extends BackupContents {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** UTC ISO instant the backup was made. */
  createdAt: string;
}

export type BackupParse =
  | { ok: true; backup: Backup }
  | {
      ok: false;
      /**
       * - `not-json`: the text is not JSON at all.
       * - `not-a-backup`: JSON, but not a file this app wrote.
       * - `newer`: written by a later version of the app than this one.
       * - `damaged`: one of ours, but a part is missing or has the wrong shape.
       */
      reason: 'not-json' | 'not-a-backup' | 'newer' | 'damaged';
      message: string;
    };

/** Counts for telling the pilot what a backup, or the device, holds. No logbook data. */
export interface BackupSummary {
  sources: { source: SourceId; fileName: string; importedAt: string }[];
  decisions: number;
  /** Entries in the merged logbook that are not deleted; undefined when there is none. */
  mainEntries: number | undefined;
  /** Types, aircraft and simulators the pilot has edited or added. */
  aircraftEdits: number;
  /** Names of the documents present. */
  documents: string[];
}
