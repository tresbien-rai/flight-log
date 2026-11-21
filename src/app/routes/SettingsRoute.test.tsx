import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '@core/validation/testing';
import { createMemoryStore } from '../test/memoryStore';
import { renderApp } from '../test/render';

vi.mock('@storage/airportsLoader', async () => {
  const { lookup } = await import('@core/validation/testing');
  return { loadAirports: async () => lookup };
});

describe('settings', () => {
  it('writes last name first by default, and remembers a change', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    renderApp(store, '/settings');
    expect(await screen.findByRole('radio', { name: /Last name first/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /First name first/ }));
    expect(screen.getByRole('radio', { name: /First name first/ })).toBeChecked();
    await waitFor(() => expect(store.settings.get('app.nameOrder')).toBe('given-first'));
  });

  it('writes flight numbers with a space by default, and without one when chosen', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    await store.replaceBook(
      'logten',
      makeLogbook({
        aircraftTypes: [makeType({ id: 'C172' })],
        airframes: [
          makeAirframe({
            id: 'a1',
            registrations: [{ value: 'N1' }],
            configurations: [{ value: 'C172' }],
          }),
        ],
        entries: [makeEntry({ id: 'e1', airframeId: 'a1', flightNumber: 'DL3939' })],
      }),
      { updatedAt: '2025-01-01T00:00:00Z', issues: [], notes: [] },
    );
    const first = renderApp(store, '/entry/e1');
    expect(await screen.findAllByText('DL 3939')).not.toHaveLength(0);
    first.unmount();

    renderApp(store, '/settings');
    await user.click(await screen.findByRole('radio', { name: /Without a space/ }));
    await waitFor(() => expect(store.settings.get('app.flightNumberStyle')).toBe('joined'));
  });

  it('shows crew in the chosen order', async () => {
    const store = createMemoryStore();
    await store.replaceBook(
      'logten',
      makeLogbook({
        aircraftTypes: [makeType({ id: 'C172' })],
        airframes: [
          makeAirframe({
            id: 'a1',
            registrations: [{ value: 'N1' }],
            configurations: [{ value: 'C172' }],
          }),
        ],
        people: [{ id: 'p1', name: 'Sam Sample', givenName: 'Sam', familyName: 'Sample' }],
        entries: [
          makeEntry({ id: 'e1', airframeId: 'a1', crew: [{ personId: 'p1', role: 'PIC' }] }),
        ],
      }),
      { updatedAt: '2025-01-01T00:00:00Z', issues: [], notes: [] },
    );
    const first = renderApp(store, '/entry/e1');
    expect(await screen.findByText('Sample, Sam')).toBeInTheDocument();
    first.unmount();

    await store.setSetting('app.nameOrder', 'given-first');
    renderApp(store, '/entry/e1');
    expect(await screen.findByText('Sam Sample')).toBeInTheDocument();
  });
});
