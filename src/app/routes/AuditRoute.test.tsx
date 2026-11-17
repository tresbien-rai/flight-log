import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import foreflightText from '../../../fixtures/pair/foreflight.csv?raw';
import logtenText from '../../../fixtures/pair/logten.txt?raw';
import { describe, expect, it, vi } from 'vitest';
import { importFile } from '@storage/index';
import { createMemoryStore } from '../test/memoryStore';
import { renderApp } from '../test/render';

vi.mock('@storage/airportsLoader', async () => {
  const { lookup } = await import('@core/validation/testing');
  return { loadAirports: async () => lookup };
});

const NOW = '2025-06-01T12:00:00Z';
const logten = { name: 'logten.txt', text: logtenText };
const foreflight = {
  name: 'foreflight.csv',
  text: foreflightText,
};

async function auditStore() {
  const store = createMemoryStore();
  await importFile(store, logten, { now: () => NOW });
  await importFile(store, foreflight, { now: () => NOW });
  return store;
}

const rows = () =>
  within(screen.getByRole('list', { name: 'Flights to review' })).getAllByRole('button');

describe('audit screen', () => {
  it('says which exports are missing', async () => {
    const store = createMemoryStore();
    await importFile(store, logten, { now: () => NOW });
    renderApp(store, '/audit');
    expect(await screen.findByText(/Still needed: ForeFlight\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Import' })).toHaveAttribute('href', '/import');
  });

  it('shows what is open, the totals and the flights to review', async () => {
    renderApp(await auditStore(), '/audit');
    const list = await screen.findByRole('list', { name: 'Flights to review' });
    expect(within(list).getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'To do (5)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(rows()[2]).toHaveTextContent('Confirm pairing: different aircraft');
    expect(rows()[3]).toHaveTextContent('Only in ForeFlight');

    const totals = screen.getByRole('table');
    expect(within(totals).getByRole('row', { name: /Night/ })).toHaveTextContent('Night0.80.30.8');
    expect(screen.getByText('Not built yet.')).toBeInTheDocument();
  });

  it('applies and removes a rule for a whole group', async () => {
    const user = userEvent.setup();
    const store = await auditStore();
    renderApp(store, '/audit');
    await user.click(await screen.findByRole('button', { name: 'Apply: Rounding' }));
    expect(await screen.findByText('On · settles 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'To do (4)' })).toBeInTheDocument();
    expect(await store.listDecisions()).toMatchObject([
      { kind: 'bulk', pattern: 'rounding', choice: 'more-precise' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Turn off: Rounding' }));
    expect(await screen.findByRole('button', { name: 'To do (5)' })).toBeInTheDocument();
    expect(await store.listDecisions()).toEqual([]);
  });

  it('decides one field by picking a side, typing a value, and clearing', async () => {
    const user = userEvent.setup();
    const store = await auditStore();
    renderApp(store, '/audit');
    await user.click((await screen.findAllByRole('button', { name: /2 Mar 2024/ }))[0]!);

    const night = await screen.findByRole('group', { name: /Night/ });
    expect(night).toHaveTextContent('Open');
    expect(within(night).getByRole('radio', { name: /LogTen/ })).not.toBeChecked();
    await user.click(within(night).getByRole('radio', { name: /ForeFlight/ }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: /Night/ })).getByRole('radio', {
          name: /ForeFlight/,
        }),
      ).toBeChecked(),
    );
    expect(screen.getByRole('group', { name: /Night/ })).toHaveTextContent('Your choice');
    expect(screen.getByRole('button', { name: 'To do (4)' })).toBeInTheDocument();
    expect(screen.getByText('Nothing left to decide on this one.')).toBeInTheDocument();

    const input = screen.getByLabelText('Something else');
    await user.type(input, 'lots');
    await user.click(screen.getByRole('button', { name: 'Use' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Hours, such as 1.5 or 1:30.');
    await user.clear(input);
    await user.type(input, '0.5{Enter}');
    await waitFor(() => expect(screen.getByText('Typed')).toBeInTheDocument());
    const decisions = await store.listDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      kind: 'pair',
      fields: { 'durations.night': { choice: { value: 30 } } },
    });

    await user.click(screen.getByRole('button', { name: 'Clear my choice for Night' }));
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /Night/ })).toHaveTextContent('Open'),
    );
    expect(screen.getByRole('button', { name: 'To do (5)' })).toBeInTheDocument();
  });

  it('confirms a pairing, or splits it and pairs it again', async () => {
    const user = userEvent.setup();
    const store = await auditStore();
    renderApp(store, '/audit');
    await user.click((await screen.findAllByRole('button', { name: /4 Mar 2024/ }))[0]!);
    expect(
      await screen.findByText(/paired despite different aircraft\. Are they the same flight\?/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Same flight' }));
    expect(await screen.findByText(/you confirmed it is one flight/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Different flights' }));
    await waitFor(() => expect(rows()).toHaveLength(6));
    const split = screen.getAllByRole('button', { name: /4 Mar 2024/ });
    expect(split).toHaveLength(2);
    expect(split[0]).toHaveTextContent('Only in LogTen');

    await user.click(split[0]!);
    await user.click(await screen.findByRole('button', { name: 'Pair it again' }));
    await waitFor(() => expect(rows()).toHaveLength(5));
  });

  it('keeps or leaves out one-app-only entries, one at a time or all at once', async () => {
    const user = userEvent.setup();
    const store = await auditStore();
    renderApp(store, '/audit');
    await user.click((await screen.findAllByRole('button', { name: /10 Mar 2024/ }))[0]!);
    expect(
      await screen.findByText(/This entry is only in ForeFlight\. Should it be in your logbook\?/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave it out' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Leave it out' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(await store.listDecisions()).toMatchObject([
      { kind: 'orphan', side: 'b', action: 'drop' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Leave it out' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'To do (5)' })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Keep all 2' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'To do (3)' })).toBeInTheDocument(),
    );
    expect((await store.listDecisions()).map((d) => d.kind === 'orphan' && d.action)).toEqual([
      'keep',
      'keep',
    ]);
  });

  it('filters by the field that differs and by what is decided', async () => {
    const user = userEvent.setup();
    renderApp(await auditStore(), '/audit');
    await screen.findByRole('list', { name: 'Flights to review' });
    await user.selectOptions(screen.getByLabelText('Difference in'), 'tail');
    expect(rows()).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Difference in'), '');
    await user.click(screen.getByRole('button', { name: 'Decided by you' }));
    expect(screen.getByText('Nothing to show.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(rows()).toHaveLength(5);
  });

  it('builds my logbook and opens it', async () => {
    const user = userEvent.setup();
    const store = await auditStore();
    renderApp(store, '/audit');
    await user.click(await screen.findByRole('button', { name: 'Build my logbook' }));
    expect(await screen.findByText(/Built with 6 entries\./)).toBeInTheDocument();
    expect((await store.loadBook('main'))!.entries).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Rebuild my logbook' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open my logbook' }));
    expect(await screen.findByRole('combobox', { name: 'Book' })).toHaveValue('main');
  });

  it('shows a flight as a full-screen sheet on a narrow screen, with the overview above the list', async () => {
    window.__wide = false;
    try {
      const user = userEvent.setup();
      renderApp(await auditStore(), '/audit');
      expect(await screen.findByRole('button', { name: 'Apply: Rounding' })).toBeInTheDocument();
      await user.click(screen.getAllByRole('button', { name: /2 Mar 2024/ })[0]!);
      await user.click(await screen.findByRole('button', { name: 'Back to list' }));
      expect(screen.queryByRole('complementary', { name: 'Audit detail' })).not.toBeInTheDocument();
    } finally {
      window.__wide = undefined;
    }
  });
});
