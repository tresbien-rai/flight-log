import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { LogbookStore } from '@storage/index';
import { AppRoutes } from '../App';
import { StoreProvider } from '../store/StoreProvider';

/** Mounts the whole app on a memory router at `path`, against the given store. */
export function renderApp(store: LogbookStore, path = '/') {
  return render(
    <StoreProvider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </StoreProvider>,
  );
}
