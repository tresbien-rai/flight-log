/**
 * Where the sun is. Pure; uses the NOAA solar-position approximation, which is good to well
 * under a minute of time for sunrise and sunset at the latitudes flown.
 */

const RAD = Math.PI / 180;

/** Apparent sunset / sunrise: the sun's upper edge on the horizon, allowing for refraction. */
const HORIZON = -0.833;
/** Civil twilight ends (evening) / begins (morning) at this elevation. */
const CIVIL_TWILIGHT = -6;
const HOUR_MS = 3_600_000;

/** The sun's elevation above the horizon in degrees at `ms` (Unix milliseconds). */
export function solarElevation(ms: number, lat: number, lon: number): number {
  const jd = ms / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000

  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));

  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    (4 *
      (y * Math.sin(2 * l0 * RAD) -
        2 * e * Math.sin(m * RAD) +
        4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
        0.5 * y * y * Math.sin(4 * l0 * RAD) -
        1.25 * e * e * Math.sin(2 * m * RAD))) /
    RAD; // minutes

  const utcMinutes = (((ms % 86_400_000) + 86_400_000) % 86_400_000) / 60_000;
  const trueSolar = (((utcMinutes + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = trueSolar / 4 - 180;
  const cosZenith =
    Math.sin(lat * RAD) * Math.sin(decl) +
    Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(hourAngle * RAD);
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / RAD;
}

/**
 * Night for the purpose of logging takeoffs and landings (14 CFR 61.57(b)): from one hour
 * after sunset to one hour before sunrise. True when the sun is down an hour either side.
 */
export function isNightForLandings(ms: number, lat: number, lon: number): boolean {
  return (
    solarElevation(ms - HOUR_MS, lat, lon) < HORIZON &&
    solarElevation(ms, lat, lon) < HORIZON &&
    solarElevation(ms + HOUR_MS, lat, lon) < HORIZON
  );
}

/** Night for logging night flight time (14 CFR 1.1): between evening and morning civil twilight. */
export function isNight(ms: number, lat: number, lon: number): boolean {
  return solarElevation(ms, lat, lon) < CIVIL_TWILIGHT;
}
