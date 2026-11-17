import { createContext, useContext, type ReactNode } from 'react';
import { createDexieStore, type LogbookStore } from '@storage/index';

const StoreContext = createContext<LogbookStore | undefined>(undefined);

let defaultStore: LogbookStore | undefined;

/** The one Dexie-backed store for this page, created on first use. */
function getDefaultStore(): LogbookStore {
  defaultStore ??= createDexieStore();
  return defaultStore;
}

/** Provides the logbook store. Tests pass their own in-memory `store`. */
export function StoreProvider({ store, children }: { store?: LogbookStore; children: ReactNode }) {
  return (
    <StoreContext.Provider value={store ?? getDefaultStore()}>{children}</StoreContext.Provider>
  );
}

export function useStore(): LogbookStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside a StoreProvider');
  return store;
}
