// Astronomy for the Khonshu night sky.
// Directions are equatorial unit vectors (x toward the equinox, z toward the north celestial pole).
// Stars, planets and the Milky Way are kept in the J2000 frame; the Sun, Moon and satellites come
// out in the frame of date. Time is d = days since J2000.0 (UT). Accurate to about an arcminute.
const Astro = (() => {
'use strict';

const RAD = Math.PI / 180, J2000_UNIX_DAYS = 10957.5, DELTA_T = 69 / 86400;   // TT − UT, in days
const EARTH_RADIUS = 6378.137, MU = 398600.4418, J2 = 1.08263e-3;             // km, km³/s²
const sind = d => Math.sin(d * RAD), cosd = d => Math.cos(d * RAD);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return o;
}
const toVec = (ra, dec) => [cosd(dec) * cosd(ra), cosd(dec) * sind(ra), sind(dec)];
const days = ms => ms / 86400000 - J2000_UNIX_DAYS;
const obliquity = d => 23.4393 - 3.563e-7 * d;
const siderealTime = (d, lon) => (((280.46061837 + 360.98564736629 * d + lon) % 360) + 360) % 360;   // degrees

// rotation taking J2000 directions to the equator and equinox of date
function precession(d) {
  const p = 1.396971 * d / 36525 * RAD, ce = cosd(23.4393), se = sind(23.4393), cp = Math.cos(p), sp = Math.sin(p);
  const toEcl = [1, 0, 0, 0, ce, se, 0, -se, ce], spin = [cp, -sp, 0, sp, cp, 0, 0, 0, 1];
  return mul3([1, 0, 0, 0, ce, -se, 0, se, ce], mul3(spin, toEcl));
}
function eclipticToEquatorial(lon, lat, d) {
  const cb = cosd(lat), sb = sind(lat), sl = sind(lon), ce = cosd(obliquity(d)), se = sind(obliquity(d));
  return [cb * cosd(lon), ce * cb * sl - se * sb, se * cb * sl + ce * sb];
}

const galactic = (() => {
  const zG = toVec(192.85948, 27.12825), xG = toVec(266.40499, -28.93617), yG = cross(zG, xG);
  return (l, b) => {
    const cb = cosd(b), a = cb * cosd(l), c = cb * sind(l), s = sind(b);
    return [a * xG[0] + c * yG[0] + s * zG[0], a * xG[1] + c * yG[1] + s * zG[1], a * xG[2] + c * yG[2] + s * zG[2]];
  };
})();

// ───────────────────────── Sun and Moon ─────────────────────────
function sun(d) {
  const t = d + DELTA_T, g = 357.528 + 0.9856003 * t;
  const lon = 280.460 + 0.9856474 * t + 1.915 * sind(g) + 0.020 * sind(2 * g);
  return { lon, vec: eclipticToEquatorial(lon, 0, d), dist: 1.00014 - 0.01671 * cosd(g) - 0.00014 * cosd(2 * g) };   // au
}

// Leading terms of the lunar theory in Meeus, "Astronomical Algorithms" ch. 47.
// Multiples of D, M, M', F, then the longitude (1e-6 deg) and distance (m) coefficients.
const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950],
];
const MOON_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
];
function moon(d) {
  const T = (d + DELTA_T) / 36525, T2 = T * T;
  const L = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2;
  const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.290 * T, A3 = 313.45 + 481266.484 * T;
  let sl = 3958 * sind(A1) + 1962 * sind(L - F) + 318 * sind(A2), sr = 0;
  for (const [cd, cm, cp, cf, l, r] of MOON_LR) {
    const arg = cd * D + cm * M + cp * Mp + cf * F, e = cm === 0 ? 1 : Math.abs(cm) === 1 ? E : E * E;
    sl += l * e * sind(arg); sr += r * e * cosd(arg);
  }
  let sb = -2235 * sind(L) + 382 * sind(A3) + 175 * sind(A1 - F) + 175 * sind(A1 + F) + 127 * sind(L - Mp) - 115 * sind(L + Mp);
  for (const [cd, cm, cp, cf, b] of MOON_B) {
    sb += b * (cm === 0 ? 1 : E) * sind(cd * D + cm * M + cp * Mp + cf * F);
  }
  const lon = L + sl / 1e6, lat = sb / 1e6, km = 385000.56 + sr / 1000;
  return { lon, lat, km, dist: km / EARTH_RADIUS, vec: eclipticToEquatorial(lon, lat, d) };   // dist in Earth radii
}

// ───────────────────────── planets ─────────────────────────
// JPL approximate Keplerian elements (J2000 ecliptic) and their change per century.
// Order: a (au), e, inclination, mean longitude, longitude of perihelion, longitude of node.
// magnitude(5·log10(r·Δ), phase angle) follows the classic Müller formulas.
const EARTH_ORBIT = [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
                     [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]];
const PLANETS = [
  { name: 'Mercury', color: [255, 228, 205],
    orbit: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
            [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    magnitude: (rd, i) => -0.42 + rd + 0.0380 * i - 0.000273 * i * i + 0.000002 * i ** 3 },
  { name: 'Venus', color: [255, 250, 232],
    orbit: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
            [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    magnitude: (rd, i) => -4.40 + rd + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3 },
  { name: 'Mars', color: [255, 168, 108],
    orbit: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
            [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    magnitude: (rd, i) => -1.52 + rd + 0.016 * i },
  { name: 'Jupiter', color: [255, 240, 212],
    orbit: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
            [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    magnitude: (rd, i) => -9.40 + rd + 0.005 * i },
  { name: 'Saturn', color: [255, 230, 176],
    orbit: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
            [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    magnitude: (rd, i) => -8.88 + rd + 0.044 * i },
  { name: 'Uranus', color: [190, 240, 240],
    orbit: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
            [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    magnitude: rd => -7.19 + rd },
];

// solve Kepler's equation; M and the result in degrees
function eccentricAnomaly(M, e) {
  let E = M + e / RAD * sind(M);
  for (let k = 0; k < 6; k++) E += (M - (E - e / RAD * sind(E))) / (1 - e * cosd(E));
  return E;
}
// heliocentric position in the J2000 ecliptic frame, in au
function heliocentric([el, rate], T) {
  const a = el[0] + rate[0] * T, e = el[1] + rate[1] * T, inc = el[2] + rate[2] * T;
  const L = el[3] + rate[3] * T, peri = el[4] + rate[4] * T, node = el[5] + rate[5] * T;
  const w = peri - node, E = eccentricAnomaly((((L - peri) % 360) + 540) % 360 - 180, e);
  const xp = a * (cosd(E) - e), yp = a * Math.sqrt(1 - e * e) * sind(E);
  const cw = cosd(w), sw = sind(w), co = cosd(node), so = sind(node), ci = cosd(inc), si = sind(inc);
  return [
    (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}
// fills in vec (J2000 direction), mag and dist (au) on every planet
function updatePlanets(d) {
  const T = (d + DELTA_T) / 36525, earth = heliocentric(EARTH_ORBIT, T), ce = cosd(23.43928), se = sind(23.43928);
  for (const p of PLANETS) {
    const h = heliocentric(p.orbit, T), g = [h[0] - earth[0], h[1] - earth[1], h[2] - earth[2]];
    const r = Math.hypot(h[0], h[1], h[2]);
    p.dist = Math.hypot(g[0], g[1], g[2]);
    const phase = Math.acos(clamp(dot(h, g) / (r * p.dist), -1, 1)) / RAD;
    p.mag = p.magnitude(5 * Math.log10(r * p.dist), phase);
    p.vec = norm([g[0], g[1] * ce - g[2] * se, g[1] * se + g[2] * ce]);
  }
  return PLANETS;
}

// ───────────────────────── satellites ─────────────────────────
function parseTLE(name, l1, l2) {
  const year = +l1.slice(18, 20), day = +l1.slice(20, 32);
  return {
    name: name.trim(),
    epochMs: Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (day - 1) * 86400000,
    ndot: +l1.slice(33, 43),   // half the rate of change of mean motion, rev/day²
    inc: +l2.slice(8, 16), raan: +l2.slice(17, 25), ecc: +('0.' + l2.slice(26, 33).trim()),
    argp: +l2.slice(34, 42), ma: +l2.slice(43, 51), n: +l2.slice(52, 63),   // n in rev/day
  };
}
// Position in km, equator of date. A Kepler orbit with the secular J2 drift of node and perigee:
// good to a few tens of km within a few days of the element set, which is plenty for the naked eye.
function satellitePosition(el, ms) {
  const dt = (ms - el.epochMs) / 86400000, n = el.n + 2 * el.ndot * dt, nRad = n * 2 * Math.PI / 86400;
  const a = Math.cbrt(MU / (nRad * nRad)), e = el.ecc, p = a * (1 - e * e);
  const drift = 1.5 * J2 * (EARTH_RADIUS / p) ** 2 * n * 360;   // deg/day
  const raan = el.raan - drift * cosd(el.inc) * dt;
  const argp = el.argp + drift * (2 - 2.5 * sind(el.inc) ** 2) * dt;
  const M = el.ma + (el.n * dt + el.ndot * dt * dt) * 360;
  const E = eccentricAnomaly(((M % 360) + 540) % 360 - 180, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * sind(E / 2), Math.sqrt(1 - e) * cosd(E / 2)) / RAD;
  const r = a * (1 - e * cosd(E)), u = argp + nu;
  const cu = cosd(u), su = sind(u), co = cosd(raan), so = sind(raan), ci = cosd(el.inc), si = sind(el.inc);
  return [r * (co * cu - so * su * ci), r * (so * cu + co * su * ci), r * su * si];
}
// observer on the WGS84 ellipsoid, km, equator of date; lst in degrees
function observerPosition(lat, lst) {
  const f = 1 / 298.257, c = 1 / Math.sqrt(1 - (2 * f - f * f) * sind(lat) ** 2), s = (1 - f) ** 2 * c;
  return [EARTH_RADIUS * c * cosd(lat) * cosd(lst), EARTH_RADIUS * c * cosd(lat) * sind(lst), EARTH_RADIUS * s * sind(lat)];
}
// true when a point (km from Earth's centre) is outside Earth's shadow
function sunlit(pos, sunVec) {
  const along = dot(pos, sunVec);
  return along > 0 || Math.hypot(pos[0] - along * sunVec[0], pos[1] - along * sunVec[1], pos[2] - along * sunVec[2]) > EARTH_RADIUS;
}

// latitude relative to the geomagnetic pole, which is what decides how far the aurora reaches
function geomagneticLatitude(lat, lon) {
  return Math.asin(sind(lat) * sind(80.7) + cosd(lat) * cosd(80.7) * cosd(lon + 72.7)) / RAD;
}

return {
  RAD, EARTH_RADIUS, sind, cosd, clamp, dot, cross, norm, apply, mul3, toVec, days, siderealTime, precession,
  galactic, sun, moon, PLANETS, updatePlanets, parseTLE, satellitePosition, observerPosition, sunlit,
  geomagneticLatitude,
};
})();
