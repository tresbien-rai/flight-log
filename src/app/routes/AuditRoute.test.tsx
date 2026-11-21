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
    const split = rows().filter((row) => /4 Mar 2024/.test(row.textContent ?? ''));
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

  it('proposes an operating rule for unmarked flights, by group and for one flight', async () => {
    const user = userEvent.setup();
    const store = await auditStore();
    renderApp(store, '/audit');
    // Three piston flights and one jet leg with SIC time but no flight number: all Part 91.
    const piston = await screen.findByRole('button', {
      name: 'Mark 3 piston-engine flights, 1 Mar 2024 – 5 Mar 2024 as Part 91',
    });
    expect(screen.getByRole('list', { name: 'Still to decide' })).toHaveTextContent(
      /4\s*flights without an\s+operating rule/,
    );

    await user.click(screen.getByRole('button', { name: /^Show 3 piston-engine flights/ }));
    expect(rows()).toHaveLength(3);
    await user.click(rows()[2]!);
    expect(await screen.findByText('The two apps agree on this flight.')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operating rule' }), '135');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Operating rule' })).toHaveValue('135'),
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Marked Part 135 by you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to differences' }));
    expect(rows()).toHaveLength(5);

    await user.click(
      screen.getByRole('button', {
        name: 'Mark 2 piston-engine flights, 1 Mar 2024 – 2 Mar 2024 as Part 91',
      }),
    );
    expect(await screen.findByText('Marked Part 91 by you')).toBeInTheDocument();
    expect(piston).not.toBeInTheDocument();
    expect((await store.listDecisions()).map((d) => d.kind === 'rule' && d.rule).sort()).toEqual([
      '135',
      '91',
      '91',
    ]);

    await user.click(screen.getByRole('button', { name: 'Undo marking 2 flights as Part 91' }));
    expect(
      await screen.findByRole('button', { name: /^Mark 2 piston-engine flights/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Build my logbook' }));
    await screen.findByText(/Built with 6 entries\./);
    const main = (await store.loadBook('main'))!;
    expect(main.entries.filter((e) => e.rule === '135')).toHaveLength(1);
  });

  it('shows takeoffs with landings, suggests the side that adds up, and can take every suggestion', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    const pairLt = logten.text.replace(
      /^(2024-03-05\tKAAA\tKAAA(?:\t[^\t]*){7})\t1\t1/m,
      '$1\t2\t5',
    );
    expect(pairLt).not.toBe(logten.text);
    const pairFf = foreflight.text.replace(
      /^(2024-03-05,N101AB,KAAA,KAAA,,,1\.0,1\.0,,,,"""Identical\.""",)1,1/m,
      '$15,5',
    );
    expect(pairFf).not.toBe(foreflight.text);
    await importFile(store, { name: 'l.txt', text: pairLt }, { now: () => NOW });
    await importFile(store, { name: 'f.csv', text: pairFf }, { now: () => NOW });
    renderApp(store, '/audit');

    await user.click((await screen.findAllByRole('button', { name: /5 Mar 2024/ }))[0]!);
    const card = await screen.findByRole('group', { name: /Takeoffs and landings/ });
    expect(within(card).getByRole('radio', { name: /LogTen/ })).toHaveAccessibleName(
      /Takeoffs 2 day · Landings 5 day · 2 takeoffs for 5 landings/,
    );
    expect(within(card).getByRole('radio', { name: /ForeFlight/ })).toHaveAccessibleName(
      /Suggested.*Takeoffs 5 day · Landings 5 day/,
    );
    expect(card).toHaveTextContent(
      'Suggested: ForeFlight. Its takeoffs and landings add up; the other app’s do not.',
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.selectOptions(
      screen.getByLabelText('Takeoffs and landings that differ'),
      'suggested',
    );
    await waitFor(async () =>
      expect(await store.listDecisions()).toContainEqual(
        expect.objectContaining({
          pattern: 'real',
          field: 'takeoffsLandings',
          choice: 'suggested',
        }),
      ),
    );
    expect(await screen.findByText('Settles 1.')).toBeInTheDocument();
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
