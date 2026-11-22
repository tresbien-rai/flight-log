import { HashRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { AircraftRoute } from './routes/AircraftRoute';
import { AuditRoute } from './routes/AuditRoute';
import { ImportRoute } from './routes/ImportRoute';
import { LogbookRoute } from './routes/LogbookRoute';
import { ReportRoute } from './routes/ReportRoute';
import { SettingsRoute } from './routes/SettingsRoute';
import { StoreProvider } from './store/StoreProvider';

/** The routes, without a router, so tests can mount them in a memory router. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="import" element={<ImportRoute />} />
        <Route path="settings" element={<SettingsRoute />} />
        <Route path="report" element={<ReportRoute />} />
        {/* `/aircraft/<list>/<id>`: the id only selects a row. */}
        <Route path="aircraft/*" element={<AircraftRoute />} />
        {/* `/audit` and `/audit/:id` are one screen: the id only selects a flight. */}
        <Route path="audit/*" element={<AuditRoute />} />
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
