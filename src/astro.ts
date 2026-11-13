// The sun's apparent longitude, and the moment it reaches a given longitude.
// Equinoxes, solstices, sekki, kō, jiéqì and ṛtu all start at such a moment.
// Methods from Jean Meeus, Astronomical Algorithms (2nd ed.), chapters 22,
// 25 and 32. Accurate to well under a minute from 1900 to 2100.

import { L, R } from "./vsop87";

const DAY = 86_400_000;
const J2000 = 2451545;
const rad = Math.PI / 180;

// Earth's position from VSOP87: Σ τⁱ Σ A·cos(B + C·τ).
function series(terms: number[][][], tau: number) {
  let sum = 0;
  for (let i = terms.length - 1; i >= 0; i--) {
    let s = 0;
    for (const [a, b, c] of terms[i]!) s += a! * Math.cos(b! + c! * tau);
    sum = sum * tau + s;
  }
  return sum;
}

// The sun's apparent longitude in degrees, at a Julian ephemeris day.
export function sunLongitude(jde: number) {
  const tau = (jde - J2000) / 365250;
  const t = tau * 10;
  // Geocentric longitude is the Earth's heliocentric longitude plus 180°.
  let lambda = (series(L, tau) / rad + 180) % 360;
  // Conversion to the FK5 frame, then nutation and aberration.
  const omega = (125.04452 - 1934.136261 * t) * rad;
  const ls = (280.4665 + 36000.7698 * t) * rad;
  const lm = (218.3165 + 481267.8813 * t) * rad;
  const nutation = -17.2 * Math.sin(omega) - 1.32 * Math.sin(2 * ls) - 0.23 * Math.sin(2 * lm) + 0.21 * Math.sin(2 * omega);
  lambda += (-0.09033 + nutation - 20.4898 / series(R, tau)) / 3600;
  return (lambda + 360) % 360;
}

// Terrestrial time minus universal time, in seconds. Polynomials by Espenak
// and Meeus, NASA's Five Millennium Canon of Solar Eclipses.
export function deltaT(year: number) {
  const y = year;
  if (y < 1860 || y >= 2150) {
    const u = (y - 1820) / 100;
    return -20 + 32 * u * u;
  }
  if (y < 1900) {
    const t = y - 1860;
    return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174;
  }
  if (y < 1920) {
    const t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  }
  if (y < 1941) {
    const t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  if (y < 1986) {
    const t = y - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  }
  if (y < 2005) {
    const t = y - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  }
  if (y < 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  }
  return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
}

// How fast the sun moves along the ecliptic, in degrees a day: about 1°,
// faster in January, when the Earth is nearest. From the equation of the
// centre (Meeus, chapter 25); close enough to steer Newton's method.
function sunSpeed(jde: number) {
  const m = (357.52911 + 35999.05029 * ((jde - J2000) / 36525)) * rad;
  return 0.98564736 + 0.98560028 * (1.914602 * Math.cos(m) + 0.039986 * Math.cos(2 * m)) * rad;
}

// The instant, in Unix milliseconds, when the sun reaches `longitude` near
// the instant `near`, by Newton's method.
export function sunReaches(longitude: number, near: number) {
  const year = 1970 + near / (365.2425 * DAY);
  const dt = deltaT(year) / 86400;
  let jde = near / DAY + 2440587.5 + dt;
  for (let i = 0; i < 20; i++) {
    const diff = ((longitude - sunLongitude(jde) + 540) % 360) - 180;
    jde += diff / sunSpeed(jde);
    if (Math.abs(diff) < 1e-7) break;
  }
  return (jde - dt - 2440587.5) * DAY;
}

// Every instant in a calendar year when the sun reaches a multiple of `step`
// degrees past `offset`, with its index counted from `offset`.
export function sunSteps(year: number, step: number, offset: number) {
  const out: { at: number; index: number }[] = [];
  const count = 360 / step;
  // The March equinox, near March 20, is longitude 0.
  const equinox = Date.UTC(year, 2, 20);
  for (let index = 0; index < count; index++) {
    const longitude = (offset + index * step) % 360;
    // Days from the March equinox to this longitude, wrapped into this year.
    let days = (longitude / 360) * 365.2422;
    let near = equinox + days * DAY;
    if (near >= Date.UTC(year + 1, 0, 1)) near -= 365.2422 * DAY;
    out.push({ at: sunReaches(longitude, near), index });
  }
  return out.sort((a, b) => a.at - b.at);
}
