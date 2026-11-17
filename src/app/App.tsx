import { HashRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { ImportRoute } from './routes/ImportRoute';
import { LogbookRoute } from './routes/LogbookRoute';
import { StoreProvider } from './store/StoreProvider';

/** The routes, without a router, so tests can mount them in a memory router. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="import" element={<ImportRoute />} />
        {/* `/` and `/entry/:id` are one screen: the entry id only selects a row. */}
        <Route path="*" element={<LogbookRoute />} />
      </Route>
    </Routes>
  );
}

/** A hash router, so the app works on any static host and when installed to the home screen. */
export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </StoreProvider>
  );
}
