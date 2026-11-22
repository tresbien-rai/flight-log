import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '@core/validation/testing';
import { createMemoryStore } from '../test/memoryStore';
import { renderApp } from '../test/render';

vi.mock('@storage/airportsLoader', async () => {
  const { lookup } = await import('@core/validation/testing');
  return { loadAirports: async () => lookup };
});

async function store() {
  const s = createMemoryStore();
  await s.replaceBook(
    'logten',
    makeLogbook({
      aircraftTypes: [
        makeType({
          id: 'CRJ-700',
          icaoDesignator: 'CRJ7',
          class: 'AMEL',
          engine: 'turbofan',
          retractable: true,
        }),
        makeType({ id: 'C-172S', icaoDesignator: 'C172' }),
      ],
      airframes: [
        makeAirframe({
          id: 'jet',
          registrations: [{ value: 'N700' }],
          configurations: [{ value: 'CRJ-700' }],
        }),
        makeAirframe({
          id: 'sky',
          registrations: [{ value: 'N172' }],
          configurations: [{ value: 'C-172S' }],
        }),
      ],
      entries: [
        makeEntry({
          id: 'e1',
          date: '2025-01-01',
          rule: '121',
          airframeId: 'jet',
          durations: { total: 120, pic: 0, sic: 120 },
        }),
        makeEntry({
          id: 'e2',
          date: '2025-01-02',
          rule: '121',
          airframeId: 'jet',
          durations: { total: 90, pic: 0, sic: 90 },
        }),
        makeEntry({
          id: 'e3',
          date: '2024-05-01',
          airframeId: 'sky',
          durations: { total: 66, pic: 66 },
        }),
      ],
    }),
    { updatedAt: '2025-01-03T00:00:00Z', issues: [], notes: [] },
  );
  return s;
}

const typeTable = async () =>
  within(await screen.findByRole('region', { name: 'Experience by aircraft type' })).getByRole(
    'table',
  );

describe('experience report', () => {
  it('shows the book by type with totals, and says how it was rounded', async () => {
    renderApp(await store(), '/report');
    const table = await typeTable();
    const crj = within(table).getByRole('row', { name: /CRJ-700/ });
    expect(crj).toHaveTextContent('2 flights');
    expect(crj).toHaveTextContent('3.5');
    expect(within(table).getByRole('row', { name: /^Total/ })).toHaveTextContent('4.6');
    expect(screen.getByText(/each total rounded once/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Experience report', level: 1 }),
    ).toBeInTheDocument();
  });

  it('opens the logbook on just the entries behind a number, and back to everything', async () => {
    const user = userEvent.setup();
    renderApp(await store(), '/report');
    const table = await typeTable();
    await user.click(within(table).getByRole('button', { name: /CRJ-700 · SIC: 3\.5/ }));
    const chip = await screen.findByRole('button', { name: /Showing the report's CRJ-700 · SIC/ });
    expect(await screen.findAllByText('2 entries')).not.toHaveLength(0);
    expect(screen.queryByText('3 entries')).toBeNull();
    await user.click(chip);
    expect(await screen.findByText('3 entries')).toBeInTheDocument();
  });

  it('switches layouts, marks a change, and saves it under a name', async () => {
    const user = userEvent.setup();
    const s = await store();
    renderApp(s, '/report');
    await typeTable();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout' }), 'Like ForeFlight');
    expect(within(await typeTable()).getByRole('row', { name: /CRJ7/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Adjust layout' }));
    const panel = screen.getByRole('complementary', { name: 'Report layout' });
    await user.click(within(panel).getByRole('radio', { name: /Once, on each total/ }));
    expect(screen.getByText('Changed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save as new layout…' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new layout' }), 'Insurance');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByText('Changed')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveDisplayValue('Insurance');
    await waitFor(async () => {
      const saved = (await s.loadProfileDoc('reportLayouts')) as { name: string }[];
      expect(saved.map((l) => l.name)).toEqual(['Insurance']);
    });
  });

  it('limits flights to a rule and hides a row from the panel', async () => {
    const user = userEvent.setup();
    renderApp(await store(), '/report');
    await typeTable();
    await user.click(screen.getByRole('button', { name: 'Adjust layout' }));
    const panel = screen.getByRole('complementary', { name: 'Report layout' });
    await user.click(within(panel).getByRole('button', { name: 'Part 121' }));
    expect(screen.getByText('Flights under Part 121 only', { exact: false })).toBeInTheDocument();
    expect(within(await typeTable()).queryByRole('row', { name: /C-172S/ })).toBeNull();
  });

  it('prints the pilot’s name and certificates from Settings', async () => {
    const user = userEvent.setup();
    const s = await store();
    const first = renderApp(s, '/settings');
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Pat Example');
    await user.click(screen.getByRole('button', { name: 'Add a certificate' }));
    await user.type(screen.getByRole('textbox', { name: 'Certificate' }), 'Commercial Pilot');
    await user.type(screen.getByLabelText('Last IPC'), '2025-09-22');
    await waitFor(async () =>
      expect(await s.loadProfileDoc('pilot')).toMatchObject({
        name: 'Pat Example',
        ipc: '2025-09-22',
      }),
    );
    first.unmount();

    renderApp(s, '/report');
    expect(
      await screen.findByRole('heading', { name: 'Pat Example', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Commercial Pilot')).toBeInTheDocument();
    expect(screen.getByText('22 Sep 2025')).toBeInTheDocument();
  });
});
