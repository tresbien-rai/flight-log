import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { zeroDurations } from '@core/model';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '@core/validation/testing';
import { createMemoryStore } from '../test/memoryStore';
import { renderApp } from '../test/render';

vi.mock('@storage/airportsLoader', async () => {
  const { lookup } = await import('@core/validation/testing');
  return { loadAirports: async () => lookup };
});

const durations = (total: number, simulator = 0) => ({ ...zeroDurations(), total, simulator });

async function store() {
  const s = createMemoryStore();
  await s.replaceBook(
    'logten',
    makeLogbook({
      aircraftTypes: [
        makeType({
          id: 'CRJ-700',
          make: 'Bombardier',
          model: 'CRJ700',
          icaoDesignator: 'CRJ7',
          class: 'AMEL',
          engine: 'turbofan',
          multiPilot: true,
          retractable: true,
          pressurized: true,
          typeRating: 'CL-65',
        }),
        makeType({ id: 'C-172S', make: 'Cessna', model: '172S Skyhawk', icaoDesignator: 'C172' }),
      ],
      airframes: [
        makeAirframe({
          id: 'af:N700',
          registrations: [{ value: 'N700' }],
          configurations: [{ value: 'CRJ-700' }],
        }),
        makeAirframe({
          id: 'af:N172',
          registrations: [{ value: 'N172' }],
          configurations: [{ value: 'C-172S' }],
          overrides: { taa: true },
        }),
      ],
      devices: [{ id: 'dev:FFS', name: 'FFS 1', level: 'FFS', represents: 'CRJ-700' }],
      entries: [
        makeEntry({
          id: 'e1',
          date: '2025-01-01',
          airframeId: 'af:N700',
          durations: durations(120),
        }),
        makeEntry({
          id: 'e2',
          date: '2025-01-02',
          airframeId: 'af:N700',
          durations: durations(60),
        }),
        makeEntry({
          id: 'e3',
          date: '2024-01-01',
          airframeId: 'af:N172',
          durations: durations(90),
        }),
        makeEntry({
          id: 'e4',
          date: '2024-06-01',
          kind: 'simulator',
          airframeId: undefined,
          deviceId: 'dev:FFS',
          durations: durations(0, 240),
        }),
      ],
    }),
    { updatedAt: '2025-01-01T00:00:00Z', issues: [], notes: [] },
  );
  return s;
}

describe('aircraft screen', () => {
  it('lists types by time, with each type’s detail, aircraft and flights', async () => {
    const user = userEvent.setup();
    renderApp(await store(), '/aircraft');
    const list = await screen.findByRole('list', { name: 'Types' });
    const rows = within(list).getAllByRole('link');
    expect(rows.map((r) => r.textContent)).toEqual([
      'CRJ-700Bombardier CRJ700CRJ73.0 h in 2 flights · 4.0 h in 1 simulator session',
      'C-172SCessna 172S SkyhawkC1721.5 h in 1 flight',
    ]);

    await user.click(rows[0]!);
    const detail = await screen.findByRole('complementary', { name: 'CRJ-700 detail' });
    expect(detail).toHaveTextContent('Type ratingCL-65');
    expect(detail).toHaveTextContent('Multi-pilot · Retractable gear · Pressurised');
    expect(within(detail).getByRole('link', { name: 'N700' })).toHaveAttribute(
      'href',
      '/aircraft/aircraft/af%3AN700',
    );
    expect(within(detail).getByRole('link', { name: 'FFS 1' })).toBeInTheDocument();

    await user.click(within(detail).getByRole('link', { name: 'Show its flights' }));
    expect(await screen.findByRole('button', { name: '1 type' })).toBeInTheDocument();
  });

  it('shows an aircraft’s type, registrations and differences, and opens its flights', async () => {
    const user = userEvent.setup();
    renderApp(await store(), '/aircraft/aircraft/af%3AN172');
    const detail = await screen.findByRole('complementary', { name: 'N172 detail' });
    expect(detail).toHaveTextContent('Differs from its typeTAA: yes');
    expect(within(detail).getByRole('link', { name: 'C-172S' })).toHaveAttribute(
      'href',
      '/aircraft/types/C-172S',
    );

    await user.click(within(detail).getByRole('link', { name: 'Show its flights' }));
    expect(
      await screen.findByRole('button', { name: 'Showing N172; show every aircraft' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('row').some((r) => /N700/.test(r.textContent ?? ''))).toBe(false);
  });

  it('lists simulators', async () => {
    renderApp(await store(), '/aircraft/simulators');
    const list = await screen.findByRole('list', { name: 'Simulators' });
    expect(list).toHaveTextContent('FFS 1FFS · CRJ-7004.0 h in 1 simulator session');
  });
});
