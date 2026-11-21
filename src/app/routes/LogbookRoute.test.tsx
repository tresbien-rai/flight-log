import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { zeroDurations, type Logbook } from '@core/model';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '@core/validation/testing';
import { createMemoryStore } from '../test/memoryStore';
import { renderApp } from '../test/render';

vi.mock('@storage/airportsLoader', async () => {
  const { lookup } = await import('@core/validation/testing');
  return { loadAirports: async () => lookup };
});

/** Three flights, one simulator session. The 121 leg has more night time than total time. */
function syntheticLogbook(): Logbook {
  const durations = (total: number, rest: Partial<ReturnType<typeof zeroDurations>> = {}) => ({
    ...zeroDurations(),
    total,
    ...rest,
  });
  return makeLogbook({
    aircraftTypes: [
      makeType({ id: 'C172', model: '172S' }),
      makeType({ id: 'CRJ-700', make: 'Bombardier', model: 'CL-600-2C10', engine: 'turbofan' }),
    ],
    airframes: [
      makeAirframe({
        id: 'a1',
        registrations: [{ value: 'N172AB' }],
        configurations: [{ value: 'C172' }],
      }),
      makeAirframe({
        id: 'a2',
        registrations: [{ value: 'N700SK' }],
        configurations: [{ value: 'CRJ-700' }],
      }),
    ],
    people: [{ id: 'p1', name: 'Sam Sample' }],
    entries: [
      makeEntry({
        id: 'e1',
        date: '2025-06-22',
        airframeId: 'a1',
        durations: durations(60, { pic: 60 }),
        remarks: 'Pattern work',
      }),
      makeEntry({
        id: 'e2',
        date: '2025-06-20',
        rule: '121',
        flightNumber: 'ZZ 100',
        airframeId: 'a2',
        seat: 'SIC',
        pilotFlying: true,
        crew: [{ personId: 'p1', role: 'PIC' }],
        durations: durations(120, { sic: 120, night: 200 }),
      }),
      makeEntry({
        id: 'e3',
        date: '2025-05-30',
        rule: '121',
        flightNumber: 'ZZ 101',
        airframeId: 'a2',
        durations: durations(90, { sic: 90 }),
      }),
      makeEntry({
        id: 'e4',
        kind: 'simulator',
        date: '2025-05-02',
        airframeId: undefined,
        deviceId: 'd1',
        from: undefined,
        to: undefined,
        durations: durations(0, { simulator: 72 }),
        dayTakeoffs: 0,
        landings: { dayFullStop: 0, nightFullStop: 0, dayTouchAndGo: 0, nightTouchAndGo: 0 },
      }),
    ],
  });
}

async function storeWithBook() {
  const store = createMemoryStore();
  await store.replaceBook('logten', syntheticLogbook(), {
    source: 'logten',
    fileName: 'synthetic.txt',
    updatedAt: '2026-11-17T12:00Z',
    issues: [],
    notes: [],
  });
  return store;
}

const entryRows = () => screen.getAllByRole('row').filter((r) => r.id.startsWith('row-'));
const footer = () => screen.getByRole('rowheader').closest('[role=row]') as HTMLElement;

describe('Logbook screen', () => {
  it('shows the entries as rows grouped by month, newest first, with the totals row', async () => {
    renderApp(await storeWithBook());
    await screen.findByRole('grid', { name: 'LogTen entries' });

    expect(entryRows().map((r) => r.id)).toEqual(['row-e1', 'row-e2', 'row-e3', 'row-e4']);
    expect(screen.getByText('June 2025')).toBeVisible();
    expect(screen.getByText('May 2025')).toBeVisible();

    const first = within(entryRows()[0]!);
    expect(first.getByText('N172AB')).toBeVisible();
    expect(first.getByText('C172')).toBeVisible();
    expect(first.getByText('KAAA–KBBB')).toBeVisible();
    expect(first.getByText('22')).toBeVisible();
    expect(first.getByText('Sun')).toBeVisible();
    expect(first.getAllByText('1.0').length).toBeGreaterThan(0); // total and PIC
    expect(first.getByText('1 / 0')).toBeVisible();

    // Zero values stay blank.
    expect(within(entryRows()[0]!).queryByText('0.0')).not.toBeInTheDocument();

    // The simulator session shows its length, marked as a session, and counts as no flight time.
    const sim = within(entryRows()[3]!);
    expect(sim.getAllByText('Sim')).toHaveLength(2); // device name and the entry kind in the rule column
    expect(sim.getByText('1.2')).toBeVisible();

    const foot = within(footer());
    expect(foot.getByText('4 entries')).toBeVisible();
    expect(foot.getByText('4.5')).toBeVisible(); // 60 + 120 + 90 minutes of flight time
    expect(foot.getByText('3 / 0')).toBeVisible();
  });

  it('narrows the rows and the totals when a filter is set, and the URL keeps the filter', async () => {
    const user = userEvent.setup();
    renderApp(await storeWithBook());
    await screen.findByRole('grid');

    const toggle = screen.getByRole('button', { name: 'Part 121' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Part 121' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(entryRows().map((r) => r.id)).toEqual(['row-e2', 'row-e3']);
    const foot = within(footer());
    expect(foot.getByText('2 entries')).toBeVisible();
    expect(foot.getAllByText('3.5').length).toBeGreaterThan(0); // 120 + 90 minutes, total and SIC
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(entryRows()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('reads filters from the URL', async () => {
    renderApp(await storeWithBook(), '/?kind=simulator');
    await screen.findByRole('grid');
    expect(entryRows().map((r) => r.id)).toEqual(['row-e4']);
    expect(screen.getByRole('button', { name: 'Simulator' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('searches as you type', async () => {
    const user = userEvent.setup();
    renderApp(await storeWithBook());
    await screen.findByRole('grid');
    await user.type(screen.getByRole('searchbox', { name: 'Search entries' }), 'zz 101');
    await vi.waitFor(() => expect(entryRows().map((r) => r.id)).toEqual(['row-e3']));
  });

  it('shows the detail and findings of the selected entry, and closes with Escape', async () => {
    const user = userEvent.setup();
    renderApp(await storeWithBook());
    await screen.findByRole('grid');

    // The leg with night time above total time carries an error marker.
    const flagged = await vi.waitFor(() => {
      const row = entryRows().find((r) => r.id === 'row-e2')!;
      within(row).getByText(/Error, \d+ findings?/);
      return row;
    });
    await user.click(flagged);

    const detail = await screen.findByRole('complementary', { name: 'Entry detail' });
    expect(within(detail).getByRole('heading', { level: 2 })).toHaveTextContent('Fri 20 Jun 2025');
    expect(within(detail).getByText('N700SK · CRJ-700 · KAAA–KBBB')).toBeVisible();
    expect(within(detail).getByText('Bombardier CL-600-2C10')).toBeVisible();
    expect(within(detail).getByText('ZZ 100')).toBeVisible();
    expect(within(detail).getByText('Sample, Sam')).toBeVisible();
    expect(within(detail).getByText('Second in command', { selector: 'dd' })).toBeVisible();
    expect(within(detail).getByText('Night')).toBeVisible();
    expect(within(detail).getByText('3.3 h (3:20)')).toBeVisible();

    const findings = within(detail)
      .getByRole('heading', { name: /Findings/ })
      .closest('section')!;
    expect(within(findings).getByText('Error')).toBeVisible();
    expect(within(findings).getByText(/exceeds total/i)).toBeVisible();

    expect(flagged).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Fri 20 Jun 2025')).not.toBeInTheDocument();
    expect(screen.getByText('Select an entry to see its details.')).toBeVisible();
  });

  it('opens an entry from a deep link', async () => {
    renderApp(await storeWithBook(), '/entry/e1');
    const detail = await screen.findByRole('complementary', { name: 'Entry detail' });
    expect(within(detail).getByRole('heading', { level: 2 })).toHaveTextContent('Sun 22 Jun 2025');
    expect(within(detail).getByText('Pattern work')).toBeVisible();
  });

  it('moves the selection with the arrow keys', async () => {
    const user = userEvent.setup();
    renderApp(await storeWithBook(), '/entry/e1');
    const grid = await screen.findByRole('grid');
    grid.focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('heading', { level: 2, name: 'Fri 20 Jun 2025' })).toBeVisible();
    await user.keyboard('{ArrowUp}');
    expect(await screen.findByRole('heading', { level: 2, name: 'Sun 22 Jun 2025' })).toBeVisible();
  });

  it('lists only entries with findings when asked', async () => {
    const user = userEvent.setup();
    renderApp(await storeWithBook());
    await screen.findByRole('grid');
    await user.click(screen.getByRole('button', { name: 'With findings' }));
    await vi.waitFor(() => expect(entryRows().map((r) => r.id)).toContain('row-e2'));
    // The clean one-hour flight has no findings and drops out.
    expect(entryRows().map((r) => r.id)).not.toContain('row-e1');
  });

  it('says so when no entries match, and offers to clear the filters', async () => {
    const user = userEvent.setup();
    renderApp(await storeWithBook(), '/?q=nothing-like-this');
    expect(await screen.findByText('No entries match these filters.')).toBeVisible();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole('status')).getByRole('button', { name: 'Clear filters' }),
    );
    expect(await screen.findByRole('grid')).toBeVisible();
    expect(entryRows()).toHaveLength(4);
  });

  it('explains an empty device and links to the import screen', async () => {
    renderApp(createMemoryStore());
    expect(await screen.findByText('No logbook on this device yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Import a logbook export' })).toHaveAttribute(
      'href',
      '/import',
    );
    // The book switcher stays hidden until a book exists.
    expect(screen.queryByRole('combobox', { name: 'Book' })).not.toBeInTheDocument();
  });

  it('shows an error with a way to retry when the store fails', async () => {
    const store = createMemoryStore();
    store.listBooks = () => Promise.reject(new Error('disk on fire'));
    renderApp(store);
    expect(await screen.findByRole('alert')).toHaveTextContent('disk on fire');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('offers only books that exist and remembers the choice', async () => {
    const user = userEvent.setup();
    const store = await storeWithBook();
    await store.replaceBook('foreflight', makeLogbook({ entries: [makeEntry({ id: 'f1' })] }), {
      source: 'foreflight',
      fileName: 'ff.csv',
      updatedAt: '2026-11-17T12:00Z',
      issues: [],
      notes: [],
    });
    renderApp(store);
    const select = await screen.findByRole('combobox', { name: 'Book' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['LogTen', 'ForeFlight']);
    await user.selectOptions(select, 'foreflight');
    expect(await screen.findByRole('grid', { name: 'ForeFlight entries' })).toBeVisible();
    expect(store.settings.get('app.selectedBook')).toBe('foreflight');
  });
});
