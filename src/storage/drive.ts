/**
 * The few Google Drive calls the app makes, behind an interface so tests use a fake and the
 * rest of the app never sees HTTP. The app uses the `drive.file` scope, so it sees only the
 * files and folders it created itself. See docs/DESIGN.md §3.3.
 */

export const FOLDER_NAME = 'Flight Log';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveFile {
  id: string;
  name: string;
  /** UTC ISO instant of the last change, as Drive reports it. */
  modifiedTime: string;
  size?: number;
}

export interface DriveApi {
  /** The visible "Flight Log" folder, created if the app has not made one. Returns its id. */
  ensureFolder(): Promise<string>;
  /** The file called `name` in the folder, if the app has put one there. */
  findFile(folderId: string, name: string): Promise<DriveFile | undefined>;
  /** Creates the file, or replaces its contents when one with that name exists. */
  putFile(folderId: string, name: string, text: string): Promise<DriveFile>;
  /** The text of a file. */
  readFile(id: string): Promise<string>;
}

/** Drive refused or failed. `status` is the HTTP status; 401 means the sign-in has lapsed. */
export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** Escapes a value for a Drive search query. */
const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Drive over HTTPS. `token` is asked for on every call, so a refreshed sign-in is picked up
 * and a missing one fails with a 401 `DriveError` instead of a vague network error.
 */
export function createDriveApi(
  token: () => string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): DriveApi {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const bearer = token();
    if (!bearer) throw new DriveError(401, 'Not signed in to Google.');
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${bearer}` },
      });
    } catch (error) {
      throw new DriveError(0, `Google Drive could not be reached: ${String(error)}`);
    }
    if (!response.ok) {
      let detail = '';
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        detail = body.error?.message ?? '';
      } catch {
        // No readable error body.
      }
      throw new DriveError(response.status, detail || `Drive answered ${response.status}.`);
    }
    return response;
  }

  const json = async <T>(response: Response) => (await response.json()) as T;

  async function list(query: string): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,modifiedTime,size)',
      spaces: 'drive',
      pageSize: '10',
    });
    const body = await json<{ files?: (Omit<DriveFile, 'size'> & { size?: string })[] }>(
      await call(`${API}/files?${params}`),
    );
    return (body.files ?? []).map(({ size, ...file }) => ({
      ...file,
      ...(size === undefined ? {} : { size: Number(size) }),
    }));
  }

  return {
    async ensureFolder() {
      const found = await list(
        `mimeType = '${FOLDER_MIME}' and name = ${quote(FOLDER_NAME)} and trashed = false`,
      );
      if (found[0]) return found[0].id;
      const created = await json<{ id: string }>(
        await call(`${API}/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
        }),
      );
      return created.id;
    },

    async findFile(folderId, name) {
      const found = await list(
        `${quote(folderId)} in parents and name = ${quote(name)} and trashed = false`,
      );
      return found[0];
    },

    async putFile(folderId, name, text) {
      const existing = await this.findFile(folderId, name);
      const metadata = existing
        ? { name }
        : { name, parents: [folderId], mimeType: 'application/json' };
      const boundary = `flight-log-${Math.random().toString(36).slice(2)}`;
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${text}\r\n--${boundary}--`;
      const url = existing ? `${UPLOAD}/files/${existing.id}` : `${UPLOAD}/files`;
      const file = await json<Omit<DriveFile, 'size'> & { size?: string }>(
        await call(`${url}?uploadType=multipart&fields=id,name,modifiedTime,size`, {
          method: existing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        }),
      );
      const { size, ...rest } = file;
      return { ...rest, ...(size === undefined ? {} : { size: Number(size) }) };
    },

    async readFile(id) {
      return (await call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text();
    },
  };
}

/** A Drive held in memory, for tests. Files are keyed by folder and name. */
export function createMemoryDrive(now: () => string = () => new Date().toISOString()): DriveApi & {
  files: Map<string, { file: DriveFile; text: string }>;
} {
  const files = new Map<string, { file: DriveFile; text: string }>();
  let next = 1;
  let folder: string | undefined;
  return {
    files,
    async ensureFolder() {
      folder ??= `folder-${next++}`;
      return folder;
    },
    async findFile(folderId, name) {
      return files.get(`${folderId}/${name}`)?.file;
    },
    async putFile(folderId, name, text) {
      const key = `${folderId}/${name}`;
      const file: DriveFile = {
        id: files.get(key)?.file.id ?? `file-${next++}`,
        name,
        modifiedTime: now(),
        size: text.length,
      };
      files.set(key, { file, text });
      return file;
    },
    async readFile(id) {
      for (const held of files.values()) if (held.file.id === id) return held.text;
      throw new DriveError(404, 'File not found.');
    },
  };
}
