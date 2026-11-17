import type { SourceId } from '../importers';

/**
 * Rules that are switched off by default for a book imported from a given app, because the
 * app cannot record what the rule asks for.
 */
export const RULES_OFF_BY_SOURCE: Readonly<Record<SourceId, readonly string[]>> = {
  logten: [],
  // ForeFlight has no flight number field, so every airline leg would be "incomplete".
  foreflight: ['airline-incomplete'],
};
