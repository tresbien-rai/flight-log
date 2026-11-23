# Backup samples

One saved backup file per schema version, built from the synthetic exports in `fixtures/pair`.
`src/core/backup/backup.test.ts` reads each one, so a change to the backup format cannot
silently stop older backups from restoring.

| File      | Version | Holds                                                                         |
| --------- | ------- | ----------------------------------------------------------------------------- |
| `v1.json` | 1       | Both exports, two bulk decisions, two aircraft edits, pilot details, settings |

When the format changes, add the new version's sample here and keep the old ones.
