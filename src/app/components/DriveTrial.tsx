import { useRef, useState } from 'react';
import { createDriveApi, DriveError, FOLDER_NAME, type DriveApi } from '@storage/index';
import {
  GOOGLE_CLIENT_ID,
  isStandalone,
  signIn,
  SignInError,
  type GoogleToken,
} from '../lib/googleSignIn';
import { formatImportedAt } from '../lib/format';

const TEST_FILE = 'sign-in-test.json';

type Phase =
  | { name: 'idle' }
  | { name: 'working'; step: string }
  | { name: 'ok'; title: string; detail: string }
  | { name: 'failed'; title: string; detail: string; advice: string };

const ADVICE: Record<string, string> = {
  'popup-blocked':
    'The browser did not allow Google’s sign-in window. Try again from a tap; if this is the home-screen app, open the app in Safari and try there, then tell me what happened.',
  'popup-closed': 'The sign-in window was closed before it finished. Tap the button to try again.',
  denied:
    'Google refused. Check that this Google account is listed as a test user while the project is unpublished, and that it allowed access to files this app creates.',
  'script-failed': 'Google’s sign-in script needs the network. Check the connection and try again.',
  'no-client-id':
    'The app was built without a Google client ID (VITE_GOOGLE_CLIENT_ID), so it cannot sign in.',
};

/**
 * A first trial of Google sign-in and Drive, to find out whether it works from this device
 * (above all from the iPad home-screen app) before sync is built on it. It writes one small
 * file into the "Flight Log" folder and reads it back. Nothing from the logbook is sent.
 */
export function DriveTrial({
  driveFor = createDriveApi,
  signInWith = signIn,
}: {
  /** Tests pass a fake Drive. */
  driveFor?: (token: () => string | undefined) => DriveApi;
  signInWith?: () => Promise<GoogleToken>;
}) {
  const [token, setToken] = useState<GoogleToken>();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  /** The same token the Drive calls read, kept outside render so a call sees a fresh one. */
  const current = useRef<GoogleToken>(undefined);
  const standalone = isStandalone();

  const failure = (error: unknown): Phase => {
    if (error instanceof SignInError) {
      return {
        name: 'failed',
        title: 'Signing in to Google did not work.',
        detail: error.message,
        advice: ADVICE[error.reason] ?? 'Try again.',
      };
    }
    if (error instanceof DriveError && error.status === 401) {
      current.current = undefined;
      setToken(undefined);
      return {
        name: 'failed',
        title: 'The Google sign-in has lapsed.',
        detail: error.message,
        advice: 'Sign in again. Nothing on this device changed.',
      };
    }
    return {
      name: 'failed',
      title: 'Google Drive did not accept the test file.',
      detail: error instanceof Error ? error.message : String(error),
      advice:
        error instanceof DriveError && error.status === 403
          ? 'Check that the Drive API is enabled in the Google Cloud project and the drive.file scope is on the consent screen.'
          : 'Nothing on this device changed. Try again.',
    };
  };

  async function connect() {
    setPhase({ name: 'working', step: 'Waiting for Google…' });
    try {
      const received = await signInWith();
      current.current = received;
      setToken(received);
      setPhase({ name: 'idle' });
    } catch (error) {
      setPhase(failure(error));
    }
  }

  async function writeTest() {
    setPhase({ name: 'working', step: 'Writing a test file to Drive…' });
    try {
      const drive = driveFor(() => {
        const held = current.current;
        return held && held.expiresAt > Date.now() ? held.accessToken : undefined;
      });
      const folder = await drive.ensureFolder();
      const text = JSON.stringify({
        purpose: 'Sign-in test. Safe to delete.',
        madeAt: new Date().toISOString(),
        runningAs: standalone ? 'home-screen app' : 'browser tab',
      });
      const file = await drive.putFile(folder, TEST_FILE, text);
      const back = await drive.readFile(file.id);
      if (back !== text) throw new Error('The file read back from Drive is not what was written.');
      setPhase({
        name: 'ok',
        title: 'Google Drive works from here.',
        detail: `Wrote ${TEST_FILE} (${text.length} bytes) to the “${FOLDER_NAME}” folder in your Drive and read it back.`,
      });
    } catch (error) {
      setPhase(failure(error));
    }
  }

  const busy = phase.name === 'working';
  // An expired token is found out by the next Drive call, which answers 401 (see `failure`).
  const signedIn = token !== undefined;

  return (
    <fieldset className="settings-group">
      <legend className="section-title">Google Drive (trial)</legend>
      <p className="lede">
        A trial of signing in to Google and writing one small file to a “{FOLDER_NAME}” folder in
        your Drive. It finds out whether this works on this device before backups are synced there.
        No logbook data is sent.
      </p>
      <p className="muted">
        Running as the {standalone ? 'home-screen app' : 'browser tab'}.
        {signedIn && token
          ? ` Signed in until about ${formatImportedAt(new Date(token.expiresAt).toISOString())}.`
          : ''}
      </p>
      {GOOGLE_CLIENT_ID === undefined && signInWith === signIn ? (
        <p className="muted">{ADVICE['no-client-id']}</p>
      ) : (
        <div className="actions">
          <button
            type="button"
            className={signedIn ? 'btn' : 'btn btn-primary'}
            disabled={busy}
            onClick={() => void connect()}
          >
            {signedIn ? 'Sign in again' : 'Sign in with Google'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !signedIn}
            onClick={() => void writeTest()}
          >
            Write a test file
          </button>
        </div>
      )}
      <div aria-live="polite" className="outcome-region">
        {phase.name === 'working' ? (
          <div className="outcome" role="status">
            <p className="outcome-title">{phase.step}</p>
            <progress className="progress" aria-label="Google progress" />
          </div>
        ) : null}
        {phase.name === 'ok' ? (
          <div className="outcome outcome--ok" role="status">
            <p className="outcome-title">{phase.title}</p>
            <p>{phase.detail}</p>
          </div>
        ) : null}
        {phase.name === 'failed' ? (
          <div className="outcome outcome--error" role="alert">
            <p className="outcome-title">{phase.title}</p>
            <p>{phase.detail}</p>
            <p>{phase.advice}</p>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
