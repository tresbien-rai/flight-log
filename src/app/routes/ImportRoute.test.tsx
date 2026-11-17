import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import foreflightSample from '../../../fixtures/foreflight/sample.csv?raw';
import logtenSample from '../../../fixtures/logten/sample.txt?raw';
import { createMemoryStore } from '../test/memoryStore';
import { renderApp } from '../test/render';

// Loading the real 3 MB airport table is not what these tests are about.
vi.mock('@storage/airportsLoader', async () => {
  const { lookup } = await import('@core/validation/testing');
  return { loadAirports: async () => lookup };
});

const file = (text: string, name: string) => new File([text], name, { type: 'text/plain' });
const chooser = () => screen.getByLabelText('Logbook export file');

describe('Import screen', () => {
  it('imports a LogTen export and reports what it found', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    renderApp(store, '/import');

    expect(
      await screen.findByText('No books yet. Import a file above to create one.'),
    ).toBeVisible();
    await user.upload(chooser(), file(logtenSample, 'logten-sample.txt'));

    const outcome = await screen.findByText('Imported 19 entries');
    expect(outcome).toBeVisible();
    expect(screen.getByText(/recognised as a LogTen Pro export/)).toBeVisible();

    // Issues are summarised by code, with a count, and expand to messages.
    const issues = screen.getByRole('region', { name: 'Import issues' });
    expect(within(issues).getByText('unknown-approach-type')).toBeVisible();
    expect(within(issues).getByText('2')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Conversion notes' })).toBeVisible();

    expect(await store.listBooks()).toHaveLength(1);
    expect(await screen.findByText(/logten-sample\.txt/, { selector: '.book-meta' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open logbook' })).toBeVisible();
  });

  it('opens the logbook after an import', async () => {
    const user = userEvent.setup();
    renderApp(createMemoryStore(), '/import');
    await user.upload(chooser(), file(foreflightSample, 'ff.csv'));
    await user.click(await screen.findByRole('button', { name: 'Open logbook' }));
    expect(await screen.findByRole('grid', { name: 'ForeFlight entries' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Book' })).toHaveValue('foreflight');
  });

  it('explains a file that is not a logbook export and changes nothing', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    renderApp(store, '/import');
    await user.upload(chooser(), file('just some notes', 'notes.txt'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This file is not a recognised logbook export.');
    expect(alert).toHaveTextContent('notes.txt');
    expect(alert).toHaveTextContent('export the logbook as tab-delimited text');
    expect(await store.listBooks()).toHaveLength(0);
  });

  it('asks before replacing an existing book, and replaces only when told to', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    renderApp(store, '/import');

    await user.upload(chooser(), file(logtenSample, 'first.txt'));
    await screen.findByText('Imported 19 entries');
    const first = (await store.listBooks())[0];

    await user.upload(chooser(), file(logtenSample, 'second.txt'));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('This replaces your LogTen book.');
    expect(confirm).toHaveTextContent('first.txt');
    // Nothing has been replaced yet.
    expect((await store.listBooks())[0]?.fileName).toBe('first.txt');

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect((await store.listBooks())[0]?.updatedAt).toBe(first?.updatedAt);

    await user.upload(chooser(), file(logtenSample, 'second.txt'));
    await user.click(await screen.findByRole('button', { name: 'Replace LogTen book' }));
    await screen.findByText('Imported 19 entries');
    expect((await store.listBooks())[0]?.fileName).toBe('second.txt');
  });

  it('removes a book only after confirmation', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    renderApp(store, '/import');
    await user.upload(chooser(), file(logtenSample, 'first.txt'));
    await screen.findByText('Imported 19 entries');

    await user.click(await screen.findByRole('button', { name: 'Remove LogTen' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Remove LogTen' });
    expect(confirm).toHaveTextContent('Remove the LogTen book from this device?');
    expect(await store.listBooks()).toHaveLength(1);

    await user.click(within(confirm).getByRole('button', { name: 'Keep' }));
    expect(await store.listBooks()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Remove LogTen' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove LogTen' }),
    );
    expect(
      await screen.findByText('No books yet. Import a file above to create one.'),
    ).toBeVisible();
    expect(await store.listBooks()).toHaveLength(0);
  });
});
