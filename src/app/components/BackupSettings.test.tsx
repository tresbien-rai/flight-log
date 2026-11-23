import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBackup } from '@core/backup';
import SAMPLE from '../../../fixtures/backup/v1.json?raw';
import foreflightText from '../../../fixtures/pair/foreflight.csv?raw';
import logtenText from '../../../fixtures/pair/logten.txt?raw';
import { importFile } from '@storage/index';
import { createMemoryStore } from '../test/memoryStore';
import { renderApp } from '../test/render';
import { LAST_BACKUP_SETTING } from './BackupSettings';

vi.mock('@storage/airportsLoader', async () => {
  const { lookup } = await import('@core/validation/testing');
  return { loadAirports: async () => lookup };
});

const sampleFile = (text = SAMPLE, name = 'flight-log-backup-2026-11-22.json') =>
  new File([text], name, { type: 'application/json' });

/** What the app handed to the browser to download. */
let downloads: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  downloads = [];
  let pending: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    pending = blob;
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) downloads.push({ name: this.download, blob: pending });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function populatedStore() {
  const store = createMemoryStore();
  const now = () => '2025-06-01T12:00:00Z';
  await importFile(store, { name: 'old-logten.txt', text: logtenText }, { now });
  await store.putDecisions([{ kind: 'bulk', pattern: 'rounding', choice: 'a', decidedAt: now() }]);
  await store.saveProfileDoc('pilot', {
    name: 'Old Name',
    certificates: [],
    medical: { class: '' },
  });
  return store;
}

describe('backup in settings', () => {
  it('downloads a backup that reads back, and remembers when', async () => {
    const user = userEvent.setup();
    const store = await populatedStore();
    renderApp(store, '/settings');
    expect(await screen.findByText(/No backup has been made on this device yet/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Download a backup' }));
    expect(await screen.findByText('Backup downloaded')).toBeVisible();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.name).toMatch(/^flight-log-backup-\d{4}-\d{2}-\d{2}\.json$/);

    const parsed = parseBackup(await downloads[0]!.blob.text());
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.backup.sources.map((s) => s.fileName)).toEqual(['old-logten.txt']);
    expect(parsed.backup.decisions).toHaveLength(1);
    expect(parsed.backup.documents).toEqual({
      pilot: { name: 'Old Name', certificates: [], medical: { class: '' } },
    });
    expect(store.settings.get(LAST_BACKUP_SETTING)).toBe(parsed.backup.createdAt);
    expect(screen.getByText(/Last backup made on this device/)).toBeVisible();
  });

  it('restores onto an empty device without talk of replacing', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    renderApp(store, '/settings');
    await user.upload(await screen.findByLabelText('Backup file'), sampleFile());

    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    expect(within(dialog).getByText(/2 audit decisions/)).toBeVisible();
    expect(within(dialog).getByText(/LogTen Pro export logten.txt/)).toBeVisible();
    expect(within(dialog).queryByText(/is deleted/)).toBeNull();
    expect(await store.listBooks()).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Restore this backup' }));
    expect(await screen.findByText(/Restored the backup of/)).toBeVisible();
    expect(screen.getByText('Books on this device: My logbook, LogTen, ForeFlight.')).toBeVisible();
    expect((await store.listBooks()).map((b) => b.book)).toEqual(['main', 'logten', 'foreflight']);
    expect(await store.listDecisions()).toHaveLength(2);

    // The restored settings and pilot details show at once.
    expect(screen.getByRole('radio', { name: /First name first/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Without a space/ })).toBeChecked();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Pat Example'));
  });

  it('names what a restore deletes, offers to save it first, and can be cancelled', async () => {
    const user = userEvent.setup();
    const store = await populatedStore();
    renderApp(store, '/settings');
    await user.upload(await screen.findByLabelText('Backup file'), sampleFile());

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Restoring replaces what is on this device.',
    });
    expect(within(dialog).getByText(/is deleted and not merged/)).toBeVisible();
    expect(within(dialog).getByText(/LogTen Pro export old-logten.txt/)).toBeVisible();
    expect(within(dialog).getByText('1 audit decision')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Download what is here first' }));
    expect(downloads).toHaveLength(1);
    const saved = parseBackup(await downloads[0]!.blob.text());
    expect(saved.ok && saved.backup.sources[0]?.fileName).toBe('old-logten.txt');
    expect(within(dialog).getByText(/Downloaded what is here as flight-log-backup-/)).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await store.loadSourceFile('logten'))?.fileName).toBe('old-logten.txt');
    expect(await store.listDecisions()).toHaveLength(1);
  });

  it('replaces what is on the device when confirmed', async () => {
    const user = userEvent.setup();
    const store = await populatedStore();
    renderApp(store, '/settings');
    await user.upload(await screen.findByLabelText('Backup file'), sampleFile());
    await user.click(await screen.findByRole('button', { name: 'Replace with this backup' }));
    expect(await screen.findByText(/Restored the backup of/)).toBeVisible();
    expect((await store.loadSourceFile('logten'))?.fileName).toBe('logten.txt');
    expect(await store.loadProfileDoc('pilot')).toMatchObject({ name: 'Pat Example' });
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Pat Example'));
  });

  it('refuses a file that is not a backup and changes nothing', async () => {
    const user = userEvent.setup();
    const store = await populatedStore();
    renderApp(store, '/settings');
    await user.upload(
      await screen.findByLabelText('Backup file'),
      sampleFile(foreflightText, 'foreflight.json'),
    );
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This file is not a Flight Log backup.')).toBeVisible();
    expect(within(alert).getByText(/Nothing on this device changed/)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await store.listDecisions()).toHaveLength(1);
  });

  it('says when a backup is from a newer version', async () => {
    const user = userEvent.setup();
    const newer = JSON.stringify({ ...(JSON.parse(SAMPLE) as object), version: 99 });
    renderApp(createMemoryStore(), '/settings');
    await user.upload(await screen.findByLabelText('Backup file'), sampleFile(newer));
    expect(
      await screen.findByText('This backup is from a newer version of Flight Log.'),
    ).toBeVisible();
  });
});
