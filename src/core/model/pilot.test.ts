import { describe, expect, it } from 'vitest';
import { completePilotProfile, EMPTY_PILOT } from './pilot';

describe('completePilotProfile', () => {
  it('is empty for nothing stored', () => {
    expect(completePilotProfile(undefined)).toEqual(EMPTY_PILOT);
    expect(completePilotProfile([1])).toEqual(EMPTY_PILOT);
  });

  it('keeps a well-formed profile', () => {
    const profile = {
      name: 'Pat Example',
      certificates: [{ title: 'Commercial Pilot', details: 'ASEL' }],
      medical: { class: 'First', date: '2026-01-05' },
      flightReview: '2025-09-22',
      ipc: '2025-09-22',
    };
    expect(completePilotProfile(profile)).toEqual(profile);
  });

  it('drops malformed parts', () => {
    expect(
      completePilotProfile({
        name: 7,
        certificates: [{ title: 'CFI' }, 'x'],
        medical: { class: 'Second', date: 'soon' },
        flightReview: '22 Sep 2025',
      }),
    ).toEqual({
      name: '',
      certificates: [{ title: 'CFI', details: '' }],
      medical: { class: 'Second' },
    });
  });
});
