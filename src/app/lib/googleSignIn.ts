/**
 * Google sign-in for Drive, through Google Identity Services' token client. The script is
 * loaded only when the pilot asks to sign in, so the rest of the app never needs the network.
 * Tokens last about an hour and the browser may not renew them silently; the app treats an
 * expired sign-in as "sync later", never as an error that blocks logging.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/** The OAuth client ID built into this copy of the app, if any. */
export const GOOGLE_CLIENT_ID: string | undefined =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || undefined;

export interface GoogleToken {
  accessToken: string;
  /** Epoch milliseconds after which Google will refuse it (a minute early, to be safe). */
  expiresAt: number;
}

export type SignInFailure =
  'no-client-id' | 'script-failed' | 'popup-blocked' | 'popup-closed' | 'denied' | 'error';

export class SignInError extends Error {
  constructor(
    readonly reason: SignInFailure,
    message: string,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
      error_callback?: (error: { type?: string; message?: string }) => void;
    }): TokenClient;
  };
}

declare global {
  interface Window {
    google?: { accounts?: GoogleAccounts };
  }
}

let scriptLoading: Promise<GoogleAccounts> | undefined;

/** Adds Google's script to the page once. */
export function loadGoogleScript(): Promise<GoogleAccounts> {
  const ready = window.google?.accounts;
  if (ready) return Promise.resolve(ready);
  scriptLoading ??= new Promise<GoogleAccounts>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const accounts = window.google?.accounts;
      if (accounts) resolve(accounts);
      else reject(new SignInError('script-failed', 'Google’s sign-in script loaded but is empty.'));
    };
    script.onerror = () =>
      reject(new SignInError('script-failed', 'Google’s sign-in script could not be loaded.'));
    document.head.append(script);
  }).catch((error: unknown) => {
    scriptLoading = undefined; // allow a retry, e.g. after the network comes back
    throw error;
  });
  return scriptLoading;
}

/**
 * Asks Google for an access token. Must be called from a tap, or the browser blocks the
 * popup. `prompt` is left to Google: it skips the account chooser when it can.
 */
export async function signIn(
  clientId: string | undefined = GOOGLE_CLIENT_ID,
  now: () => number = Date.now,
): Promise<GoogleToken> {
  if (!clientId) {
    throw new SignInError('no-client-id', 'This copy of the app has no Google client ID.');
  }
  const accounts = await loadGoogleScript();
  return new Promise<GoogleToken>((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          const reason = response.error === 'access_denied' ? 'denied' : 'error';
          reject(
            new SignInError(
              reason,
              response.error_description || response.error || 'Google gave no access token.',
            ),
          );
          return;
        }
        const seconds = Number(response.expires_in) || 3600;
        resolve({ accessToken: response.access_token, expiresAt: now() + (seconds - 60) * 1000 });
      },
      error_callback: (error) => {
        const reason =
          error.type === 'popup_failed_to_open'
            ? 'popup-blocked'
            : error.type === 'popup_closed'
              ? 'popup-closed'
              : 'error';
        reject(new SignInError(reason, error.message || error.type || 'Sign-in failed.'));
      },
    });
    client.requestAccessToken();
  });
}

/** Whether the app is running from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}
