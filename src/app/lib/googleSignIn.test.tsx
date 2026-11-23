import { afterEach, describe, expect, it } from 'vitest';
import { SignInError, signIn } from './googleSignIn';

type Config = Parameters<
  NonNullable<NonNullable<typeof window.google>['accounts']>['oauth2']['initTokenClient']
>[0];

/** A stand-in for Google's script: `behave` decides what the token client does when asked. */
function fakeGoogle(behave: (config: Config) => void) {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => ({ requestAccessToken: () => behave(config) }),
      },
    },
  };
}
afterEach(() => {
  delete window.google;
});

describe('signIn', () => {
  it('gives the token and when it stops working, a minute early', async () => {
    fakeGoogle((c) => c.callback({ access_token: 'abc', expires_in: 3599 }));
    const token = await signIn('client-id', () => 1_000_000);
    expect(token).toEqual({ accessToken: 'abc', expiresAt: 1_000_000 + 3539_000 });
  });

  it('asks for the drive.file scope with the given client', async () => {
    let seen: Config | undefined;
    fakeGoogle((c) => {
      seen = c;
      c.callback({ access_token: 'abc', expires_in: 3600 });
    });
    await signIn('client-id');
    expect(seen?.client_id).toBe('client-id');
    expect(seen?.scope).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it.each([
    ['popup_failed_to_open', 'popup-blocked'],
    ['popup_closed', 'popup-closed'],
    ['something_else', 'error'],
  ])('names a %s failure', async (type, reason) => {
    fakeGoogle((c) => c.error_callback?.({ type }));
    await expect(signIn('client-id')).rejects.toMatchObject({ reason });
  });

  it('names a refusal', async () => {
    fakeGoogle((c) => c.callback({ error: 'access_denied' }));
    await expect(signIn('client-id')).rejects.toMatchObject({ reason: 'denied' });
  });

  it('fails clearly with no client ID', async () => {
    const error = await signIn(undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignInError);
    expect(error).toMatchObject({ reason: 'no-client-id' });
  });
});
