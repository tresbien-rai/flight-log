/**
 * Durations are integer minutes. Parsing accepts decimal hours ("1.6", ".5", "2"),
 * H:MM ("1:36") and H+MM ("1+36"). Blank, invalid or negative input yields null.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim();
  if (s === '') return null;

  const hm = /^(\d+)[:+](\d{1,2})$/.exec(s);
  if (hm) {
    const minutes = Number(hm[2]);
    if (minutes > 59) return null;
    return Number(hm[1]) * 60 + minutes;
  }

  if (/^(\d+\.?\d*|\.\d+)$/.test(s)) {
    // Round the decimal-hour product to 6 places first so that float noise
    // (e.g. 1.05 * 60 = 63.00000000000001, 0.7 * 60 = 42.00000000000001)
    // cannot tip an exact half-minute the wrong way.
    return Math.round(Number((Number(s) * 60).toFixed(6)));
  }

  return null;
}

/** Minutes as decimal hours, e.g. 96 -> "1.6". Negative or non-finite input is a programming error. */
export function formatDecimal(minutes: number, places = 1): string {
  assertMinutes(minutes);
  return (minutes / 60).toFixed(places);
}

/** Minutes as H:MM, e.g. 96 -> "1:36". */
export function formatHM(minutes: number): string {
  assertMinutes(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function assertMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`Expected non-negative integer minutes, got ${minutes}`);
  }
}
