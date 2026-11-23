import { describe, expect, it, vi } from 'vitest';
import { createDriveApi, createMemoryDrive, DriveError } from './drive';

/** A request URL with its query readable. */
const decoded = (url: string) => decodeURIComponent(url.replace(/\+/g, ' '));

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('createDriveApi', () => {
  it('fails with a 401 when there is no token, without calling Drive', async () => {
    const fetcher = vi.fn();
    const drive = createDriveApi(() => undefined, fetcher);
    await expect(drive.ensureFolder()).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('finds the folder when there is one, and sends the token', async () => {
    const fetcher = vi.fn(async () =>
      reply({ files: [{ id: 'f1', name: 'Flight Log', modifiedTime: 't' }] }),
    );
    const drive = createDriveApi(() => 'tok', fetcher);
    expect(await drive.ensureFolder()).toBe('f1');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(decoded(url)).toContain("name = 'Flight Log'");
    expect(decoded(url)).toContain('trashed = false');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('creates the folder when there is none', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ files: [] }))
      .mockResolvedValueOnce(reply({ id: 'new' }));
    const drive = createDriveApi(() => 'tok', fetcher);
    expect(await drive.ensureFolder()).toBe('new');
    const [, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Flight Log',
      mimeType: 'application/vnd.google-apps.folder',
    });
  });

  it('creates a file in the folder, then replaces it in place', async () => {
    const created = { id: 'a', name: 'x.json', modifiedTime: 't', size: '5' };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ files: [] }))
      .mockResolvedValueOnce(reply(created))
      .mockResolvedValueOnce(reply({ files: [created] }))
      .mockResolvedValueOnce(reply(created));
    const drive = createDriveApi(() => 'tok', fetcher);
    expect(await drive.putFile('dir', 'x.json', 'hello')).toEqual({
      id: 'a',
      name: 'x.json',
      modifiedTime: 't',
      size: 5,
    });
    const [firstUrl, first] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(first.method).toBe('POST');
    expect(firstUrl).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(first.body as string).toContain('"parents":["dir"]');
    expect(first.body as string).toContain('hello');

    await drive.putFile('dir', 'x.json', 'again');
    const [secondUrl, second] = fetcher.mock.calls[3] as [string, RequestInit];
    expect(second.method).toBe('PATCH');
    expect(secondUrl).toContain('/files/a?uploadType=multipart');
    expect(second.body as string).not.toContain('parents');
  });

  it('escapes quotes in a search', async () => {
    const fetcher = vi.fn(async () => reply({ files: [] }));
    await createDriveApi(() => 'tok', fetcher).findFile("d'ir", "it's.json");
    const url = decoded((fetcher.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("'d\\'ir' in parents");
    expect(url).toContain("name = 'it\\'s.json'");
  });

  it('reads a file as text', async () => {
    const fetcher = vi.fn(async () => reply('contents'));
    expect(await createDriveApi(() => 'tok', fetcher).readFile('a/b')).toBe('contents');
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toContain('/files/a%2Fb?alt=media');
  });

  it('reports Drive’s own message and status', async () => {
    const fetcher = vi.fn(async () => reply({ error: { message: 'API not enabled' } }, 403));
    const error = await createDriveApi(() => 'tok', fetcher)
      .ensureFolder()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(error).toMatchObject({ status: 403, message: 'API not enabled' });
  });

  it('reports a network failure as status 0', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createDriveApi(() => 'tok', fetcher).ensureFolder()).rejects.toMatchObject({
      status: 0,
    });
  });
});

describe('createMemoryDrive', () => {
  it('keeps one file per name and reads it back', async () => {
    const drive = createMemoryDrive(() => 't');
    const folder = await drive.ensureFolder();
    expect(await drive.ensureFolder()).toBe(folder);
    const one = await drive.putFile(folder, 'a.json', 'one');
    const two = await drive.putFile(folder, 'a.json', 'two');
    expect(two.id).toBe(one.id);
    expect(await drive.readFile(one.id)).toBe('two');
    expect(await drive.findFile(folder, 'b.json')).toBeUndefined();
    await expect(drive.readFile('nope')).rejects.toMatchObject({ status: 404 });
  });
});
