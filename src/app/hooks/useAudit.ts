import { useCallback, useEffect, useRef, useState } from 'react';
import type { AirportLookup } from '@core/airports';
import type { SourceId } from '@core/importers';
import { loadAudit, reresolve, type Audit } from '@storage/index';
import { useStore } from '../store/StoreProvider';
import { useAirports } from './useAirports';

export type AuditState =
  | { status: 'loading' }
  | { status: 'missing'; missing: SourceId[] }
  | { status: 'error'; message: string }
  | { status: 'ready'; audit: Audit };

/**
 * The audit of the two imported files, kept current. Parsing and pairing happen once per
 * pair of files; a change to the decisions only applies them again.
 */
export function useAudit(): { state: AuditState; retry: () => void } {
  const store = useStore();
  const airportsState = useAirports();
  const airports: AirportLookup | undefined =
    airportsState.status === 'ready' ? airportsState.airports : undefined;
  const [state, setState] = useState<AuditState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  /** The parsed files in hand, and which imports they came from. */
  const held = useRef<{ stamp: string; audit: Audit } | undefined>(undefined);
  /** Read at load time, so the airport table arriving late needs no new subscription. */
  const airportsRef = useRef(airports);
  const refreshRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let again = false;
    held.current = undefined;

    const load = async () => {
      const books = await store.listBooks();
      const stamp = (['logten', 'foreflight'] as const)
        .map((id) => books.find((b) => b.book === id)?.updatedAt ?? '')
        .join('|');
      if (held.current?.stamp === stamp) {
        const audit = reresolve(held.current.audit, await store.listDecisions(), {
          airports: airportsRef.current,
        });
        if (cancelled) return;
        held.current = { stamp, audit };
        setState({ status: 'ready', audit });
        return;
      }
      const outcome = await loadAudit(store, { airports: airportsRef.current });
      if (cancelled) return;
      if (outcome.ok) {
        held.current = { stamp, audit: outcome.audit };
        setState({ status: 'ready', audit: outcome.audit });
      } else {
        held.current = undefined;
        setState({ status: 'missing', missing: outcome.missing });
      }
    };

    // One load at a time; a write that lands during a load triggers one more afterwards.
    const refresh = () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      load()
        .catch((error: unknown) => {
          if (!cancelled) {
            setState({
              status: 'error',
              message: error instanceof Error ? error.message : String(error),
            });
          }
        })
        .finally(() => {
          running = false;
          if (again && !cancelled) {
            again = false;
            refresh();
          }
        });
    };

    refresh();
    refreshRef.current = refresh;
    const unsubscribe = store.subscribe(refresh);
    return () => {
      cancelled = true;
      refreshRef.current = undefined;
      unsubscribe();
    };
  }, [store, attempt]);

  // The airport table arrives after the first load; apply it without parsing again.
  useEffect(() => {
    airportsRef.current = airports;
    if (airports) refreshRef.current?.();
  }, [airports]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
