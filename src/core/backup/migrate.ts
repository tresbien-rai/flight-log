/**
 * Steps from each older backup version to the next. Pure; each takes the parsed JSON of version
 * `n` and returns version `n + 1`. Version 1 is the first, so there are none yet.
 *
 * When the shape changes: bump `BACKUP_VERSION`, add the step here under the old number, and
 * keep a sample file of the old version in the tests so the step stays proven.
 */
import { BACKUP_VERSION } from './types';

type Json = Record<string, unknown>;

export const MIGRATIONS: Record<number, (older: Json) => Json> = {};

/** Brings a backup of any earlier version up to the current one. */
export function migrate(backup: Json, from: number, steps = MIGRATIONS, to = BACKUP_VERSION): Json {
  let current = backup;
  for (let version = from; version < to; version++) {
    const step = steps[version];
    if (!step) throw new Error(`No migration from backup version ${version}.`);
    current = { ...step(current), version: version + 1 };
  }
  return current;
}
