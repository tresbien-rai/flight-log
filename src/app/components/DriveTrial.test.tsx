import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryDrive, DriveError } from '@storage/index';
import { SignInError, type GoogleToken } from '../lib/googleSignIn';
import { DriveTrial } from './DriveTrial';

const token = (): GoogleToken => ({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 });

describe('Drive trial', () => {
  it('signs in, writes the test file and reads it back', async () => {
    const user = userEvent.setup();
    const drive = createMemoryDrive();
    render(<DriveTrial driveFor={() => drive} signInWith={async () => token()} />);
    expect(screen.getByRole('button', { name: 'Write a test file' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await user.click(await screen.findByRole('button', { name: 'Write a test file' }));
    expect(await screen.findByText('Google Drive works from here.')).toBeVisible();
    expect(drive.files.size).toBe(1);
    expect([...drive.files.values()][0]?.file.name).toBe('sign-in-test.json');
    expect(screen.getByText(/Running as the browser tab/)).toBeVisible();
  });

  it('says why a sign-in failed', async () => {
    const user = userEvent.setup();
    const signInWith = vi.fn().mockRejectedValue(new SignInError('popup-blocked', 'blocked'));
    render(<DriveTrial driveFor={() => createMemoryDrive()} signInWith={signInWith} />);
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Signing in to Google did not work.');
    expect(alert).toHaveTextContent('open the app in Safari');
  });

  it('asks for a new sign-in when Drive says the old one lapsed', async () => {
    const user = userEvent.setup();
    const drive = createMemoryDrive();
    drive.ensureFolder = async () => {
      throw new DriveError(401, 'Invalid credentials');
    };
    render(<DriveTrial driveFor={() => drive} signInWith={async () => token()} />);
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await user.click(await screen.findByRole('button', { name: 'Write a test file' }));
    expect(await screen.findByText('The Google sign-in has lapsed.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Write a test file' })).toBeDisabled();
  });

  it('points at the Drive API setting on a 403', async () => {
    const user = userEvent.setup();
    const drive = createMemoryDrive();
    drive.ensureFolder = async () => {
      throw new DriveError(403, 'Drive API has not been used');
    };
    render(<DriveTrial driveFor={() => drive} signInWith={async () => token()} />);
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await user.click(await screen.findByRole('button', { name: 'Write a test file' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Drive API is enabled');
  });
});
