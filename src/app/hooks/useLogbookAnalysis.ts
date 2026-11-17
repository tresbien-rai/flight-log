import { useEffect, useMemo, useState } from 'react';
import type { Logbook } from '@core/model';
import { indexLogbook } from '@core/query';
import { validate, type Finding } from '@core/validation';
import { findingsByEntry } from '../lib/findings';
import { useAirports } from './useAirports';

export interface Analysis {
  index: ReturnType<typeof indexLogbook>;
  /** Findings keyed by entry id. Empty until `checking` is false. */
  findings: ReadonlyMap<string, Finding[]>;
  /** True while the validation rules have not finished running. */
  checking: boolean;
  /** True when airport data could not be loaded, so airport checks were skipped. */
  airportsMissing: boolean;
}

const NO_FINDINGS: ReadonlyMap<string, Finding[]> = new Map();

/**
 * Indexes the logbook and validates it once per load. Validation runs just after first paint
 * so the list appears without waiting for the rules.
 */
export function useLogbookAnalysis(logbook: Logbook): Analysis {
  const airports = useAirports();
  const index = useMemo(() => indexLogbook(logbook), [logbook]);
  const [done, setDone] = useState<{
    logbook: Logbook;
    findings: ReadonlyMap<string, Finding[]>;
  }>();

  const airportsSettled = airports.status !== 'loading';
  const lookup = airports.status === 'ready' ? airports.airports : undefined;

  useEffect(() => {
    if (!airportsSettled) return;
    const timer = setTimeout(() => {
      setDone({
        logbook,
        findings: findingsByEntry(validate(logbook, { airports: lookup })),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [logbook, lookup, airportsSettled]);

  const ready = done?.logbook === logbook;
  return {
    index,
    findings: ready ? done.findings : NO_FINDINGS,
    checking: !ready,
    airportsMissing: airports.status === 'failed',
  };
}
