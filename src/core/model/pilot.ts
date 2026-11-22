/**
 * What the pilot holds, printed at the head of the experience report. Stored as typed; nothing
 * here is tracked or checked. See docs/DESIGN.md §8.1.
 */
export interface Certificate {
  /** e.g. "Airline Transport Pilot". */
  title: string;
  /** Ratings and limitations as written on the certificate, e.g. "AMEL, CL-65 type rating". */
  details: string;
}

export interface PilotProfile {
  name: string;
  certificates: Certificate[];
  medical: { class: string; date?: string };
  /** `YYYY-MM-DD` of the last flight review and instrument proficiency check. */
  flightReview?: string;
  ipc?: string;
}

export const EMPTY_PILOT: PilotProfile = { name: '', certificates: [], medical: { class: '' } };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const date = (v: unknown): string | undefined =>
  typeof v === 'string' && DATE.test(v) ? v : undefined;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A profile from storage, with anything missing or malformed left empty. */
export function completePilotProfile(stored: unknown): PilotProfile {
  if (!isRecord(stored)) return EMPTY_PILOT;
  const medical = isRecord(stored.medical) ? stored.medical : {};
  const profile: PilotProfile = {
    name: text(stored.name),
    certificates: Array.isArray(stored.certificates)
      ? stored.certificates.flatMap((c): Certificate[] =>
          isRecord(c) ? [{ title: text(c.title), details: text(c.details) }] : [],
        )
      : [],
    medical: { class: text(medical.class) },
  };
  const medicalDate = date(medical.date);
  if (medicalDate) profile.medical.date = medicalDate;
  const flightReview = date(stored.flightReview);
  if (flightReview) profile.flightReview = flightReview;
  const ipc = date(stored.ipc);
  if (ipc) profile.ipc = ipc;
  return profile;
}
