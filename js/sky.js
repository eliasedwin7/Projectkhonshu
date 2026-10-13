// Khonshu night sky: renderer and controls.
// Needs data/sky-data.js, js/astro.js and js/audio.js. data/sky-images.js (the photographic
// Milky Way and Moon) is optional; without it both are drawn by code.
(() => {
'use strict';
const { RAD, sind, cosd, clamp, dot, cross, norm, apply, mul3, toVec } = Astro;

// ───────────────────────── settings ─────────────────────────
// Default location is Canberra. Tilt 90 = looking straight up (ceiling); "facing" is the
// compass direction at the bottom edge of the picture. Constellation lines and names show
// while the mouse is moving; "lines" and "names" pin them on permanently.
// "aurora" is how strong a display to show regardless of the real storm level (0 = real storms only).
const DEFAULTS = {
  meteors: 3, volume: 60, brightness: 100, darkness: 90, clouds: 15, fov: 100, tilt: 90, facing: 180, moon: 3,
  aurora: 65, lat: -35.28, lon: 149.13, lines: false, names: false, daylight: true, online: true, mirror: false,
  sounds: false,
};
const STORE_KEY = 'khonshu-settings-v4';
const settings = Object.assign({}, DEFAULTS, loadJSON(STORE_KEY) || {});
const SPEEDS = [1, 10, 60, 600, 3600], SPEED_LABELS = ['live', '10×', '1 min/s', '10 min/s', '1 h/s'];
let speedIdx = 0, timeOffset = 0, simTime = Date.now();

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ───────────────────────── helpers ─────────────────────────
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const nowSec = () => performance.now() / 1000;
const altAz = (az, alt) => [sind(az) * cosd(alt), cosd(az) * cosd(alt), sind(alt)];   // east, north, up

// Seeded so the faint background stars are the same every night.
const rng = mulberry32(20261013);
function gauss() {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeNoise() {
  const perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rng(); }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)), t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const fade = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi);
    const X = xi & 255, Y = yi & 255;
    const a = vals[perm[perm[X] + Y]], b = vals[perm[perm[X + 1] + Y]];
    const c = vals[perm[perm[X] + Y + 1]], d = vals[perm[perm[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, octaves) => {
    let sum = 0, amp = 0.5, total = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * noise(x, y); total += amp; x *= 2.03; y *= 2.03; amp *= 0.5; }
    return sum / total;
  };
}

// piecewise-linear lookup in a table of [x, value] rows; values may be numbers or arrays
function ramp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, a] = table[i - 1], [x1, b] = table[i], t = (x - x0) / (x1 - x0);
      return typeof a === 'number' ? a + (b - a) * t : a.map((v, k) => v + (b[k] - v) * t);
    }
  }
  return table[table.length - 1][1];
}

// ───────────────────────── view ─────────────────────────
// H: equator of date → local east/north/up.  HP: the same for J2000 directions (stars, planets).
// V: east/north/up → camera right/up/forward.  C = V·HP takes a J2000 direction to the camera.
// The camera frame is projected stereographically so constellations keep their shapes.
const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, unit = 1;
const view = { H: [], HP: [], V: [], C: [], lst: 0, s: 1, cx: 0, cy: 0, zMin: -1 };
const pt = { x: 0, y: 0, k: 1, up: 0 };

function updateView(d) {
  view.lst = Astro.siderealTime(d, settings.lon);
  const sL = sind(view.lst), cL = cosd(view.lst), sP = sind(settings.lat), cP = cosd(settings.lat);
  const sA = sind(settings.facing), cA = cosd(settings.facing), sT = sind(settings.tilt), cT = cosd(settings.tilt);
  view.H = [-sL, cL, 0, -sP * cL, -sP * sL, cP, cP * cL, cP * sL, sP];
  view.V = [cA, -sA, 0, -sA * sT, -cA * sT, cT, sA * cT, cA * cT, sT];
  view.HP = mul3(view.H, Astro.precession(d));
  view.C = mul3(view.V, view.HP);
  view.s = Math.min(W, H) / 2 / (2 * Math.tan(settings.fov * RAD / 4));
  view.cx = W / 2; view.cy = H / 2;
  view.zMin = Math.cos(Math.min(2 * Math.atan(Math.hypot(W, H) / 4 / view.s) + 0.2, 2.8));
}
function projectCam(dx, dy, dz) {
  if (dz < view.zMin) return false;
  pt.k = 2 / (1 + dz);
  pt.x = view.cx + view.s * pt.k * dx; pt.y = view.cy - view.s * pt.k * dy;
  return true;
}
function projectEnu(e) {
  const c = apply(view.V, e);
  pt.up = e[2];
  return projectCam(c[0], c[1], c[2]);
}
// J2000 direction → screen; also sets pt.up (sine of the altitude)
function projectSky(v) {
  const C = view.C, HP = view.HP, x = v[0], y = v[1], z = v[2];
  pt.up = HP[6] * x + HP[7] * y + HP[8] * z;
  return projectCam(C[0] * x + C[1] * y + C[2] * z, C[3] * x + C[4] * y + C[5] * z, C[6] * x + C[7] * y + C[8] * z);
}
const onScreen = m => pt.x > m && pt.x < W - m && pt.y > m && pt.y < H - m;

// canvas-space angle of the great-circle direction from one point (east/north/up) toward another
function screenBearing(from, toward, x0, y0) {
  const t = dot(from, toward);
  const tangent = [toward[0] - t * from[0], toward[1] - t * from[1], toward[2] - t * from[2]];
  if (Math.hypot(tangent[0], tangent[1], tangent[2]) < 1e-6) return 0;
  const n = norm(tangent);
  projectEnu(norm([from[0] + 0.01 * n[0], from[1] + 0.01 * n[1], from[2] + 0.01 * n[2]]));
  return Math.atan2(pt.y - y0, pt.x - x0);
}

// Atmosphere: light from low in the sky crosses more air, so stars there dim and twinkle harder.
const airmass = up => 1 / (up + 0.025 * Math.exp(-11 * up));
const extinction = air => Math.exp(-0.16 * (air - 1));

// ───────────────────────── light: day, dusk, city glow, moonlight ─────────────────────────
// Everything that washes out the sky is folded into one number, the faintest magnitude visible.
const TWILIGHT_LIMIT = [[-18, 8.2], [-12, 5.5], [-9, 4], [-6, 2], [-3, 0], [0, -2.5], [5, -4.2], [90, -4.6]];
const TWILIGHT_SKY = [[-18, [0, 0, 0]], [-12, [3, 5, 14]], [-6, [13, 24, 52]], [-3, [28, 48, 92]],
                      [0, [58, 92, 150]], [6, [92, 140, 205]], [20, [105, 160, 228]], [90, [110, 168, 235]]];
const TWILIGHT_GLOW = [[-18, 0], [-10, 0.25], [-4, 0.6], [0, 0.75], [6, 0.5], [15, 0.35], [90, 0.3]];
const env = { sun: Astro.sun(0), sunEnu: [0, 0, -1], trueSunAlt: -90, sunAlt: -90, night: 1, limMag: 7.5, mw: 1, glare: 0, bg: [0, 0, 0], bgCss: '#000' };

function updateEnvironment() {
  env.trueSunAlt = Math.asin(env.sunEnu[2]) / RAD;
  env.sunAlt = settings.daylight ? env.trueSunAlt : -90;
  const dark = settings.darkness / 100;
  env.glare = (1 - dark) ** 2;   // city glow, 0 in the outback
  env.limMag = Math.min(ramp(TWILIGHT_LIMIT, env.sunAlt), 3.4 + 4.8 * dark - 2.2 * moon.glow);
  env.night = clamp((-env.sunAlt - 6) / 10, 0, 1);
  env.mw = clamp((env.limMag - 5.2) / 1.8, 0, 1) ** 1.5;
  const sky = ramp(TWILIGHT_SKY, env.sunAlt), g = env.glare, m = moon.glow * env.night;
  env.bg = [sky[0] + g * 30 + m * 7, sky[1] + g * 24 + m * 9, sky[2] + g * 20 + m * 14].map(v => Math.min(255, Math.round(v)));
  env.bgCss = `rgb(${env.bg})`;
}
const visible = mag => clamp((env.limMag - mag) / 1.2, 0, 1);

// ───────────────────────── sky model ─────────────────────────
const STAR_COLORS = [[255,255,255], [205,218,255], [172,193,255], [255,244,230], [255,222,182], [255,194,154]];
const COLOR_NAMES = ['white', 'blue-white', 'blue', 'yellow-white', 'orange', 'red-orange'];
const FAINT_TINTS = ['#e6ecff', '#fff3e4', '#dfe8ff', '#ffffff', '#ffeeda'];
const SPRITE_MAG = 4.5, PHASES = 5;
// dim-star levels: 0–2 are the generated background (mag 6–7.5), 3–5 are catalogue stars (mag 4.5–6)
const LEVEL_ALPHA = [0.3, 0.42, 0.55, 0.7, 0.8, 0.9];
const LEVEL_SIZE = [0.9, 1.0, 1.1, 1.25, 1.45, 1.7];
const LEVEL_MAG = [7.25, 6.75, 6.25, 5.75, 5.25, 4.75];
const LEVEL_MIN_UP = [0.22, 0.18, 0.15, 0.12, 0.09, 0.06];   // faintest stars are lost highest above the horizon
const GENERATED_STARS = 18000;

const DATA = window.SKY_DATA, IMAGES = window.SKY_IMAGES;
if (!DATA) {
  document.querySelector('#intro p').textContent = 'star catalogue missing: keep the data folder next to index.html';
  return;
}
const NCAT = DATA.stars.length / 4;
const catV = new Float32Array(NCAT * 3), catMag = new Float32Array(NCAT), catTint = new Uint8Array(NCAT);
const catPhase = new Float32Array(NCAT), catSpeed = new Float32Array(NCAT);
const starNames = new Map(DATA.named);
let spriteCount = 0, dimCat = 0, dimV, dimBuckets = [];
let segs, labels = [];

function bvTint(bv) {
  return bv < -0.1 ? 2 : bv < 0.15 ? 1 : bv < 0.45 ? 0 : bv < 0.8 ? 3 : bv < 1.2 ? 4 : 5;
}

function buildStars() {
  const S = DATA.stars;
  for (let i = 0; i < NCAT; i++) {
    catV.set(toVec(S[i * 4], S[i * 4 + 1]), i * 3);
    catMag[i] = S[i * 4 + 2]; catTint[i] = bvTint(S[i * 4 + 3]);
    catPhase[i] = rng() * Math.PI * 2; catSpeed[i] = 0.5 + rng() * 2;
    if (catMag[i] < SPRITE_MAG) spriteCount = i + 1;   // catalogue is sorted brightest first
  }
  dimCat = NCAT - spriteCount;
  dimV = new Float32Array((dimCat + GENERATED_STARS) * 3);
  const buckets = Array.from({ length: LEVEL_ALPHA.length * PHASES }, () => []);
  for (let j = 0; j < dimCat; j++) {
    const i = spriteCount + j, level = catMag[i] < 5 ? 5 : catMag[i] < 5.5 ? 4 : 3;
    dimV.set(catV.subarray(i * 3, i * 3 + 3), j * 3);
    buckets[level * PHASES + j % PHASES].push(j);
  }
  for (let j = dimCat; j < dimCat + GENERATED_STARS; j++) {
    let v;
    if (rng() < 0.42) {
      // crowd the fainter stars along the Milky Way
      v = Astro.galactic(rng() < 0.35 ? gauss() * 45 : rng() * 360, gauss() * 7);
    } else {
      const z = rng() * 2 - 1, r = Math.sqrt(1 - z * z), th = rng() * Math.PI * 2;
      v = [r * Math.cos(th), r * Math.sin(th), z];
    }
    dimV.set(v, j * 3);
    const u = rng(), level = u < 0.5 ? 0 : u < 0.81 ? 1 : 2;
    buckets[level * PHASES + j % PHASES].push(j);
  }
  dimBuckets = buckets.map(a => Int32Array.from(a));
}

function buildConstellations() {
  const out = [];
  for (const [, polylines] of DATA.lines) {
    for (const line of polylines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        out.push(...toVec(line[i], line[i + 1]), ...toVec(line[i + 2], line[i + 3]));
      }
    }
  }
  segs = Float32Array.from(out);
  labels = DATA.labels.map(([, name, , ra, dec, rank]) => ({ text: name.toUpperCase(), v: toVec(ra, dec), rank }));
}

function buildSprite([r, g, b]) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g2 = c.getContext('2d'), grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.06, 'rgba(255,255,255,1)');
  grad.addColorStop(0.14, `rgba(${r},${g},${b},.75)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},.18)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},.04)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  g2.fillStyle = grad; g2.fillRect(0, 0, 64, 64);
  return c;
}
function buildBlob([r, g, b]) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g2 = c.getContext('2d'), grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  [[0, 1], [0.25, 0.6], [0.5, 0.25], [0.75, 0.06], [1, 0]].forEach(([at, a]) => grad.addColorStop(at, `rgba(${r},${g},${b},${a})`));
  g2.fillStyle = grad; g2.fillRect(0, 0, 64, 64);
  return c;
}

buildStars();
buildConstellations();
const sprites = STAR_COLORS.map(buildSprite);
const fireSprite = buildSprite([150, 255, 200]);
// to the naked eye the Milky Way is almost colourless, so the tints stay close to grey
const blobs = { blue: buildBlob([165, 178, 215]), white: buildBlob([200, 205, 222]), warm: buildBlob([222, 210, 192]), pink: buildBlob([255, 150, 172]), sunset: buildBlob([255, 150, 70]) };
for (const p of Astro.PLANETS) p.sprite = buildSprite(p.color);

// Deep-sky objects you can pick out without a telescope: name, RA, Dec, width in degrees,
// glow strength (0 = label only), tint, kind, distance and a note for the info card.
const DEEP_SKY = [
  ['Orion Nebula', 83.82, -5.39, 1.1, 0.5, 'pink', 'Nebula', '1,340 light-years', 'A cloud where new stars are forming; the fuzzy middle star of Orion\'s sword.'],
  ['Carina Nebula', 161.26, -59.87, 2.0, 0.45, 'pink', 'Nebula', '8,500 light-years', 'One of the largest star-forming clouds in our galaxy, home of the unstable giant Eta Carinae.'],
  ['Lagoon Nebula', 270.92, -24.38, 0.9, 0.3, 'pink', 'Nebula', '4,100 light-years', 'A glowing gas cloud in Sagittarius, just visible as a grey patch.'],
  ['Tarantula Nebula', 84.68, -69.10, 0.6, 0.35, 'pink', 'Nebula', '160,000 light-years', 'The brightest star nursery in the Large Magellanic Cloud, visible although it lies in another galaxy.'],
  ['Andromeda Galaxy', 10.68, 41.27, 3.0, 0.3, 'warm', 'Galaxy', '2.5 million light-years', 'The farthest thing you can see with the naked eye: a galaxy of a trillion stars.', 0.33, 35],
  ['Omega Centauri', 201.70, -47.48, 0.6, 0.5, 'warm', 'Globular cluster', '17,000 light-years', 'The biggest star cluster in the Milky Way: about ten million ancient stars.'],
  ['47 Tucanae', 6.02, -72.08, 0.5, 0.45, 'warm', 'Globular cluster', '15,000 light-years', 'A dense ball of old stars beside the Small Magellanic Cloud.'],
  ['Pleiades', 56.75, 24.12, 1.6, 0.16, 'blue', 'Star cluster', '444 light-years', 'The Seven Sisters: young blue stars still wrapped in dust. Matariki to Māori.'],
  ['Beehive Cluster', 130.10, 19.67, 1.2, 0.2, 'white', 'Star cluster', '610 light-years', 'A swarm of about a thousand stars in Cancer.'],
  ['Ptolemy Cluster', 268.46, -34.79, 1.2, 0.28, 'white', 'Star cluster', '980 light-years', 'A bright cluster near the Scorpion\'s sting, recorded by Ptolemy in 130 AD.'],
  ['Butterfly Cluster', 265.08, -32.25, 0.5, 0.18, 'white', 'Star cluster', '1,600 light-years', 'A small cluster shaped like a butterfly, next to the Ptolemy Cluster.'],
  ['Jewel Box', 193.40, -60.37, 0.3, 0.3, 'blue', 'Star cluster', '6,400 light-years', 'A tight cluster of coloured stars beside the Southern Cross.'],
  ['Southern Pleiades', 160.74, -64.40, 1.2, 0.2, 'blue', 'Star cluster', '480 light-years', 'A bright young cluster around the star Theta Carinae.'],
  ['Wishing Well Cluster', 166.40, -58.75, 0.9, 0.25, 'white', 'Star cluster', '1,300 light-years', 'Said to look like silver coins glinting at the bottom of a well.'],
  ['Double Cluster', 34.75, 57.13, 1.0, 0.22, 'white', 'Star clusters', '7,500 light-years', 'Two young clusters side by side in Perseus.'],
  ['Hercules Cluster', 250.42, 36.46, 0.35, 0.18, 'warm', 'Globular cluster', '22,000 light-years', 'The finest globular cluster of the northern sky.'],
  ['Sagittarius Cluster', 279.10, -23.90, 0.4, 0.2, 'warm', 'Globular cluster', '10,600 light-years', 'One of the nearest globular clusters to Earth.'],
  ['Large Magellanic Cloud', 80.89, -69.76, 8, 0, 'white', 'Galaxy', '160,000 light-years', 'A small galaxy orbiting the Milky Way, seen only from southern skies.'],
  ['Small Magellanic Cloud', 13.19, -72.83, 4, 0, 'white', 'Galaxy', '200,000 light-years', 'The fainter companion galaxy of the Milky Way.'],
  ['Coalsack', 191.5, -62.7, 5, 0, 'white', 'Dark nebula', '600 light-years', 'A cloud of dust blocking the Milky Way behind it. In Aboriginal astronomy it is the head of the Emu in the Sky.'],
].map(([name, ra, dec, size, glow, tint, kind, distance, note, aspect, pa]) => ({ name, v: toVec(ra, dec), size, glow, tint, kind, distance, note, aspect, pa }));

// distance in light-years and a line for the info card
const STAR_FACTS = {
  'Sirius': [8.6, 'The brightest star in the night sky.'],
  'Canopus': [310, 'Second brightest star; spacecraft use it to find their bearings.'],
  'Rigil Kentaurus': [4.37, 'Alpha Centauri, the closest star system to the Sun.'],
  'Arcturus': [37, 'An orange giant, brightest star of the northern sky.'],
  'Vega': [25, 'It was the pole star 12,000 years ago and will be again.'],
  'Capella': [43, 'Really four stars in two close pairs.'],
  'Rigel': [860, 'A blue supergiant about 100,000 times brighter than the Sun.'],
  'Procyon': [11.5, 'One of our nearest neighbours, with a white dwarf companion.'],
  'Achernar': [139, 'Spins so fast that it is flattened like a squashed ball.'],
  'Betelgeuse': [550, 'A red supergiant that will one day explode as a supernova.'],
  'Hadar': [390, 'With Rigil Kentaurus, one of the two Pointers to the Southern Cross.'],
  'Altair': [16.7, 'Rotates once every nine hours.'],
  'Acrux': [320, 'The foot of the Southern Cross.'],
  'Aldebaran': [65, 'The red eye of Taurus the Bull.'],
  'Antares': [550, 'The heart of the Scorpion; its name means "rival of Mars".'],
  'Spica': [250, 'Two hot stars orbiting each other every four days.'],
  'Pollux': [34, 'An orange giant with a known planet.'],
  'Fomalhaut': [25, 'A young star surrounded by a ring of dust.'],
  'Deneb': [2600, 'One of the most distant stars visible to the naked eye.'],
  'Mimosa': [280, 'The left arm of the Southern Cross.'],
  'Regulus': [79, 'The heart of Leo the Lion.'],
  'Adhara': [430, 'Five million years ago it was the brightest star in the sky.'],
  'Castor': [51, 'Six stars bound together, seen as one.'],
  'Gacrux': [88, 'The red giant at the top of the Southern Cross.'],
  'Shaula': [570, 'The sting in the Scorpion\'s tail.'],
  'Bellatrix': [250, 'Orion\'s shoulder, the "Amazon Star".'],
  'Alnilam': [2000, 'The middle star of Orion\'s Belt.'],
  'Polaris': [430, 'The North Star; never rises for Australia.'],
  'Peacock': [180, 'Named in the 1930s for a Royal Air Force navigation almanac.'],
  'Alnair': [101, 'The brightest star of Grus the Crane.'],
};
const PLANET_NOTES = {
  Mercury: 'The smallest planet, never far from the Sun in our sky.',
  Venus: 'The brightest planet, wrapped in clouds that reflect most of the sunlight.',
  Mars: 'The red planet; its colour comes from rusty dust.',
  Jupiter: 'The largest planet. Binoculars show its four big moons.',
  Saturn: 'The ringed planet; a small telescope shows the rings.',
  Uranus: 'An ice giant at the very limit of naked-eye visibility.',
};

// ───────────────────────── shader layers ─────────────────────────
// The photographic Milky Way and the aurora are each a full-screen fragment shader on a small
// WebGL canvas of its own, composited into the 2D sky. Every shader starts from the same step:
// which direction does this pixel look in?
const SHADER_HEAD = `
  precision highp float;
  uniform mat3 uRot; uniform vec2 uCentre; uniform float uScale;
  vec3 direction() {
    vec2 p = (gl_FragCoord.xy - uCentre) / uScale;
    float r2 = dot(p, p), dz = (4.0 - r2) / (4.0 + r2);   // undo the stereographic projection
    return uRot * vec3(p * (1.0 + dz) * 0.5, dz);
  }`;

function createShaderLayer(body, downscale) {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return null;
  const compile = (type, code) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, code); gl.compileShader(shader);
    return shader;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, SHADER_HEAD + body));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const found = {}, uniform = name => found[name] || (found[name] = gl.getUniformLocation(prog, name));
  return {
    gl,
    set(name, ...values) { gl['uniform' + values.length + 'f'](uniform(name), ...values); },
    // rot takes directions to the camera, as a row-major matrix; GL reads it as columns, which
    // is the inverse rotation the shader needs to go from a pixel back to a direction
    draw(rot) {
      const w = Math.ceil(W / downscale), h = Math.ceil(H / downscale), q = w / W;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniformMatrix3fv(uniform('uRot'), false, rot);
      gl.uniform2f(uniform('uCentre'), view.cx * q, h - view.cy * q);
      gl.uniform1f(uniform('uScale'), view.s * q);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.globalAlpha = 1;
      ctx.drawImage(c, 0, 0, W, H);
    },
  };
}

// ───────────────────────── Milky Way ─────────────────────────
// With the NASA all-sky photo available, a shader looks up which part of that map each pixel is
// showing. Otherwise it falls back to a cloud of soft sprites sampled from a model of the Galaxy.
const milkyWayPhoto = IMAGES && IMAGES.milkyWay ? createShaderLayer(`
  uniform sampler2D uTex; uniform vec3 uUp; uniform float uGain;
  void main() {
    vec3 e = direction();                                          // J2000
    float fade = smoothstep(-0.02, 0.2, dot(uUp, e));              // lost in the haze near the horizon
    // the map is centred on RA 0 with RA increasing to the left, north at the top
    vec2 uv = vec2(0.5 - atan(e.y, e.x) / 6.2831853, 0.5 - asin(clamp(e.z, -1.0, 1.0)) / 3.14159265);
    vec3 c = texture2D(uTex, uv).rgb;
    c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.7);          // a little paler than the photograph
    c = pow(max(c - 0.12, 0.0) * 1.14, vec3(1.5));                 // drop the all-sky haze, keep the band
    gl_FragColor = vec4(c * uGain * fade, 1.0);
  }`, 1.5) : null;
if (milkyWayPhoto) {
  const img = new Image(), gl = milkyWayPhoto.gl;
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    milkyWayPhoto.ready = true;
  };
  img.src = IMAGES.milkyWay;
}

// Fallback: the Galaxy seen from the Sun as an exponential disc and a central bulge, dimmed by a
// thin patchy dust layer. Flat list of x, y, z, radius, alpha, tint for each soft sprite.
const BLOB_TINTS = ['blue', 'white', 'warm'];
const MW_SCALE = 1 / 3;
const mwCanvas = document.createElement('canvas'), mwCtx = mwCanvas.getContext('2d', { alpha: false });
let mwBlobs = null;

function buildMilkyWayBlobs() {
  const fbm = makeNoise(), out = [];
  const SUN_R = 8.2, DUST_H = 0.1, coalsack = Astro.galactic(303, -0.5);
  for (let i = 0; i < 14000; i++) {
    const bulge = rng() < 0.25;
    let x, y, z;   // kpc from the galactic centre
    if (bulge) {
      x = gauss() * 1.2; y = gauss() * 1.25; z = gauss() * 0.8;
    } else {
      const R = -3 * Math.log(Math.max(1e-9, rng() * rng())), th = rng() * Math.PI * 2;
      if (R > 16) continue;
      x = R * Math.cos(th); y = R * Math.sin(th);
      z = -0.3 * Math.log(Math.max(1e-9, rng())) * (rng() < 0.5 ? -1 : 1);
    }
    const dx = x + SUN_R, dz = z - 0.02, dist = Math.hypot(dx, y, dz);
    if (dist < 1.2) continue;
    const l = Math.atan2(y, dx) / RAD, b = Math.asin(dz / dist) / RAD, v = Astro.galactic(l, b);
    const sb = Math.max(0.01, Math.abs(dz / dist));
    let tau = 0.8 * DUST_H / sb * (1 - Math.exp(-dist * sb / DUST_H));
    tau *= 0.25 + 1.5 * fbm(l / 9 + 40, b / 3.5 + 40, 4);
    // dark clouds of Ophiuchus north of the centre, and the Coalsack beside the Southern Cross
    tau += 1.6 * Math.exp(-(((b - 5) / 5) ** 2) - ((l - 12) / 22) ** 2) * fbm(l / 6 + 7, b / 4 + 7, 3);
    tau += 5 * Math.exp(-((Math.acos(Math.min(1, dot(v, coalsack))) / RAD / 2.3) ** 2));
    // nearby disc stars far from the plane are just the ordinary star field, so taper them out
    const taper = bulge ? 1 : Math.exp(-((b / 13) ** 2));
    const alpha = Math.min(bulge ? 0.02 : 0.05, (bulge ? 1.8 : 7) * Math.exp(-tau) / (dist * dist)) * taper;
    if (alpha < 0.004) continue;
    out.push(...v, (1.3 + 3.2 / dist + rng() * 1.2) * RAD, alpha, bulge ? 2 : rng() < 0.5 ? 0 : 1);
  }
  // Magellanic Clouds
  const cloud = (ra, dec, count, spread, size) => {
    const c = toVec(ra, dec), e1 = norm(cross([0, 0, 1], c)), e2 = cross(c, e1);
    for (let i = 0; i < count; i++) {
      const a = Math.tan(gauss() * spread * RAD), b = Math.tan(gauss() * spread * 0.7 * RAD);
      out.push(...norm([c[0] + a * e1[0] + b * e2[0], c[1] + a * e1[1] + b * e2[1], c[2] + a * e1[2] + b * e2[2]]),
        size * (0.6 + rng() * 0.9) * RAD, 0.075, 1);
    }
  };
  cloud(80.89, -69.76, 80, 2.2, 1.9);
  cloud(13.19, -72.83, 40, 1.0, 1.2);
  return Float32Array.from(out);
}

function drawMilkyWayBlobs(gain) {
  if (!mwBlobs) mwBlobs = buildMilkyWayBlobs();
  const C = view.C, Hm = view.HP, s = view.s * MW_SCALE, cx = view.cx * MW_SCALE, cy = view.cy * MW_SCALE;
  const w = mwCanvas.width, h = mwCanvas.height, zMin = view.zMin;
  mwCtx.globalCompositeOperation = 'source-over';
  mwCtx.globalAlpha = 1; mwCtx.fillStyle = '#000';
  mwCtx.fillRect(0, 0, w, h);
  mwCtx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < mwBlobs.length; i += 6) {
    const x = mwBlobs[i], y = mwBlobs[i + 1], z = mwBlobs[i + 2];
    const up = Hm[6] * x + Hm[7] * y + Hm[8] * z;
    if (up < -0.03) continue;
    const dz = C[6] * x + C[7] * y + C[8] * z;
    if (dz < zMin) continue;
    const k = 2 / (1 + dz), r = s * k * mwBlobs[i + 3];
    const px = cx + s * k * (C[0] * x + C[1] * y + C[2] * z);
    if (px < -r || px > w + r) continue;
    const py = cy - s * k * (C[3] * x + C[4] * y + C[5] * z);
    if (py < -r || py > h + r) continue;
    mwCtx.globalAlpha = mwBlobs[i + 4] * gain * Math.min(1, (up + 0.03) / 0.15);
    mwCtx.drawImage(blobs[BLOB_TINTS[mwBlobs[i + 5]]], px - r, py - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(mwCanvas, 0, 0, W, H);
}

function drawMilkyWay() {
  if (env.mw < 0.02) return;
  if (milkyWayPhoto && milkyWayPhoto.ready) {
    milkyWayPhoto.set('uUp', view.HP[6], view.HP[7], view.HP[8]);
    milkyWayPhoto.set('uGain', 1.2 * env.mw);
    milkyWayPhoto.draw(view.C);
  } else {
    drawMilkyWayBlobs(env.mw);
  }
}

function drawDeepSky() {
  const vis = clamp((env.limMag - 4.6) / 2, 0, 1);
  if (vis < 0.02) return;
  for (const o of DEEP_SKY) {
    if (!o.glow || !projectSky(o.v) || pt.up < 0.03) continue;
    const x = pt.x, y = pt.y, r = Math.max(3.5 * unit, o.size * 0.8 * RAD * view.s * pt.k);
    if (x < -r || x > W + r || y < -r || y > H + r) continue;
    ctx.globalAlpha = o.glow * vis * extinction(airmass(pt.up));
    if (o.aspect) {
      // an edge-on galaxy: stretch the glow along its long axis, measured from celestial north
      const north = screenBearing(apply(view.HP, o.v), apply(view.HP, [0, 0, 1]), x, y);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(north + Math.PI / 2 - o.pa * RAD); ctx.scale(o.aspect, 1);
      ctx.drawImage(blobs[o.tint], -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.drawImage(blobs[o.tint], x - r, y - r, r * 2, r * 2);
    }
  }
}

// ───────────────────────── Sun and Moon ─────────────────────────
const MOON_RADIUS = 0.00452, MOON_RADIUS_DEG = 0.259, SUN_RADIUS = 0.00465;   // angular radii (rad, deg, rad)
const moon = {
  visible: false, x: 0, y: 0, r: 0, enu: [0, 0, -1], km: 384400, illum: 0, waxing: true, alt: 0, glow: 0, fade: 1,
  sunAngle: 0, northAngle: 0, umbra: 0.7, penumbra: 1.25, shadowSep: 180, eclipsed: 0, shadowX: 0, shadowY: 0,
};

// Stand-in used until the photo has loaded, or when data/sky-images.js is missing.
// North up, as seen from the northern hemisphere; the renderer turns it to match the real sky.
function buildMoonTexture() {
  const S = 256, R = S / 2, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(R, R, R - 1, 0, 6.2832); g.clip();
  const base = g.createRadialGradient(R, R, 0, R, R, R);
  base.addColorStop(0, '#f1eee4'); base.addColorStop(0.75, '#e6e2d6'); base.addColorStop(1, '#c2beb2');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const patch = (x, y, rx, ry, color) => {
    g.save(); g.translate(R + x * R, R + y * R); g.scale(rx * R, ry * R);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, color); gr.addColorStop(0.6, color); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
  };
  [[-0.55, 0.05, 0.3, 0.52], [-0.22, -0.42, 0.29, 0.27], [0.22, -0.32, 0.19, 0.18], [0.38, -0.08, 0.22, 0.2],
   [0.68, -0.22, 0.11, 0.13], [0.6, 0.12, 0.14, 0.17], [0.42, 0.25, 0.1, 0.1], [-0.18, 0.38, 0.22, 0.19],
   [-0.48, 0.42, 0.12, 0.12], [0, -0.72, 0.42, 0.07]].forEach(m => patch(...m, 'rgba(92,98,112,0.62)'));
  [[-0.1, 0.72, 0.05], [-0.3, -0.12, 0.045], [-0.62, -0.38, 0.03]].forEach(([x, y, s]) => patch(x, y, s, s, 'rgba(255,255,252,0.85)'));
  return c;
}
let moonTexture = buildMoonTexture();
if (IMAGES && IMAGES.moon) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(256, 256, 255, 0, 6.2832); g.clip();
    g.drawImage(img, 0, 0, 512, 512);
    moonTexture = c;
  };
  img.src = IMAGES.moon;
}

function updateSunMoon(d) {
  const sun = env.sun = Astro.sun(d), m = Astro.moon(d);
  env.sunEnu = apply(view.H, sun.vec);
  // shift from Earth's centre to the observer (the Moon is close enough for this to matter)
  const e = apply(view.H, m.vec);
  const topo = moon.enu = norm([e[0] * m.dist, e[1] * m.dist, e[2] * m.dist - 1]);
  moon.km = m.km;
  moon.illum = (1 - dot(m.vec, sun.vec)) / 2;
  moon.waxing = (((m.lon - sun.lon) % 360) + 360) % 360 < 180;
  moon.alt = Math.asin(topo[2]) / RAD;

  // Earth's shadow sits opposite the Sun; a lunar eclipse is the Moon passing through it
  const anti = [-sun.vec[0], -sun.vec[1], -sun.vec[2]];
  const parallax = Math.asin(1 / m.dist) / RAD, sunRadius = 0.2666 / sun.dist;
  moon.umbra = 1.02 * (0.99834 * parallax - sunRadius + 0.0024);
  moon.penumbra = 1.02 * (0.99834 * parallax + sunRadius + 0.0024);
  moon.shadowSep = Math.acos(clamp(dot(m.vec, anti), -1, 1)) / RAD;
  moon.eclipsed = clamp((moon.umbra + MOON_RADIUS_DEG - moon.shadowSep) / (2 * MOON_RADIUS_DEG), 0, 1);
  moon.glow = moon.illum * clamp(topo[2] * 3, 0, 1) * (1 - 0.97 * moon.eclipsed);

  moon.visible = topo[2] > -0.02 && projectEnu(topo);
  if (!moon.visible) return;
  moon.x = pt.x; moon.y = pt.y;
  moon.r = Math.max(2 * unit, view.s * pt.k * MOON_RADIUS * settings.moon);
  moon.fade = clamp((topo[2] + 0.02) / 0.1, 0, 1);
  moon.sunAngle = screenBearing(topo, env.sunEnu, moon.x, moon.y);
  moon.northAngle = screenBearing(topo, apply(view.H, [0, 0, 1]), moon.x, moon.y);
  if (moon.shadowSep < moon.penumbra + 0.3) {
    // where the shadow's centre lies relative to the Moon, in Moon radii; east is anticlockwise from north
    const pole = [0, 0, 1], pm = m.vec[2];
    const tn = norm([pole[0] - pm * m.vec[0], pole[1] - pm * m.vec[1], pole[2] - pm * m.vec[2]]), te = norm(cross(pole, m.vec));
    const north = dot(anti, tn) / RAD / MOON_RADIUS_DEG, east = dot(anti, te) / RAD / MOON_RADIUS_DEG;
    const nx = Math.cos(moon.northAngle), ny = Math.sin(moon.northAngle);
    moon.shadowX = north * nx + east * ny; moon.shadowY = north * ny - east * nx;
  }
}

function drawMoon() {
  if (!moon.visible) return;
  const { x, y, r, illum, fade } = moon, turn = moon.northAngle + Math.PI / 2;
  const halo = r * (3 + 5 * illum), light = (1 - 0.95 * moon.eclipsed) * (0.25 + 0.75 * env.night);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * (0.1 + 0.4 * illum) * light;
  ctx.drawImage(blobs.white, x - halo, y - halo, halo * 2, halo * 2);

  // at night the dark side hides the stars behind it; by day it is simply the colour of the sky
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = env.night; ctx.fillStyle = env.bgCss;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.save();   // earthshine on the dark side
  ctx.rotate(turn); ctx.globalAlpha = 0.08 * fade * env.night;
  ctx.drawImage(moonTexture, -r, -r, r * 2, r * 2);
  ctx.restore();
  // sunlit part: the limb facing the Sun plus the terminator ellipse
  ctx.save();
  ctx.rotate(moon.sunAngle);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  if (illum < 0.5) ctx.ellipse(0, 0, r * (1 - 2 * illum), r, 0, Math.PI / 2, -Math.PI / 2, true);
  else ctx.ellipse(0, 0, r * (2 * illum - 1), r, 0, Math.PI / 2, Math.PI * 1.5, false);
  ctx.closePath(); ctx.clip();
  ctx.rotate(turn - moon.sunAngle); ctx.globalAlpha = fade * (0.55 + 0.45 * env.night);
  ctx.drawImage(moonTexture, -r, -r, r * 2, r * 2);
  ctx.restore();
  if (moon.shadowSep < moon.penumbra + 0.3) {
    // Earth's shadow: a faint outer penumbra and a deep coppery umbra
    const perDegree = r / MOON_RADIUS_DEG, sx = moon.shadowX * r, sy = moon.shadowY * r, edge = moon.umbra / moon.penumbra;
    const shade = ctx.createRadialGradient(sx, sy, 0, sx, sy, moon.penumbra * perDegree);
    shade.addColorStop(0, 'rgba(46,10,4,0.95)');
    shade.addColorStop(edge * 0.94, 'rgba(64,15,5,0.9)');
    shade.addColorStop(Math.min(1, edge * 1.04), 'rgba(12,7,5,0.5)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.clip();
    ctx.globalAlpha = fade; ctx.fillStyle = shade;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
}

// glow of the Sun on the sky around it, from below the horizon at dusk to full day
function drawTwilight() {
  const strength = ramp(TWILIGHT_GLOW, env.sunAlt);
  if (strength < 0.01 || !projectEnu(env.sunEnu)) return;
  const high = clamp(env.sunAlt / 10, 0, 1), radius = view.s * 1.3;
  const inner = [255, 120 + 130 * high, 35 + 200 * high].map(Math.round), outer = [235 - 55 * high, 70 + 140 * high, 60 + 195 * high].map(Math.round);
  const glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
  glow.addColorStop(0, `rgba(${inner},${strength})`);
  glow.addColorStop(0.25, `rgba(${inner},${strength * 0.55})`);
  glow.addColorStop(0.6, `rgba(${outer},${strength * 0.18})`);
  glow.addColorStop(1, `rgba(${outer},0)`);
  ctx.globalAlpha = 1; ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawSun() {
  if (env.sunAlt < -0.8 || !projectEnu(env.sunEnu)) return;
  const r = Math.max(3 * unit, view.s * pt.k * SUN_RADIUS * settings.moon), low = 1 - clamp(env.sunAlt / 8, 0, 1);
  // glare: white when the Sun is high, orange as it nears the horizon
  ctx.globalAlpha = 0.9 * (1 - low);
  ctx.drawImage(blobs.warm, pt.x - r * 12, pt.y - r * 12, r * 24, r * 24);
  ctx.globalAlpha = 0.9 * low;
  ctx.drawImage(blobs.sunset, pt.x - r * 12, pt.y - r * 12, r * 24, r * 24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(255,${Math.round(252 - 70 * low)},${Math.round(236 - 150 * low)})`;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 6.2832); ctx.fill();
}

// ───────────────────────── satellites ─────────────────────────
// Real ones follow orbits fetched from CelesTrak (catalogue number, name, brightness at 1000 km,
// note). Without them, anonymous satellites cross at random during the hours they would be lit.
const SAT_LIST = [
  [25544, 'ISS', -1.8, 'The International Space Station: a crew of about seven, circling Earth every 92 minutes.'],
  [48274, 'Tiangong', -0.6, 'China\'s space station, home to three astronauts.'],
  [20580, 'Hubble', 2.2, 'The Hubble Space Telescope, observing since 1990.'],
];
const TLE_KEY = 'khonshu-orbits';
let realSats = [], issPass = 0, lastPassCheck = -1e9;
const satellites = [];
let nextSatellite = 70;

function loadOrbits(saved) {
  realSats = (saved && saved.items || []).map(([id, l1, l2]) => {
    const info = SAT_LIST.find(s => s[0] === id);
    return info && { name: info[1], std: info[2], note: info[3], el: Astro.parseTLE(info[1], l1, l2), fade: 0, up: -1, enu: [0, 0, -1] };
  }).filter(Boolean);
  lastPassCheck = -1e9;
}

function updateSatellites(dt) {
  const obs = Astro.observerPosition(settings.lat, view.lst);
  for (const s of realSats) {
    // an element set is only trustworthy for a few weeks either side of its date
    const fresh = Math.abs(simTime - s.el.epochMs) < 21 * 86400000;
    const pos = Astro.satellitePosition(s.el, simTime), rel = [pos[0] - obs[0], pos[1] - obs[1], pos[2] - obs[2]];
    s.range = Math.hypot(rel[0], rel[1], rel[2]);
    s.height = Math.hypot(pos[0], pos[1], pos[2]) - Astro.EARTH_RADIUS;
    s.enu = apply(view.H, [rel[0] / s.range, rel[1] / s.range, rel[2] / s.range]);
    s.up = s.enu[2];
    s.mag = s.std + 5 * Math.log10(s.range / 1000);
    const show = fresh && s.up > 0.02 && env.sunAlt < -3 && Astro.sunlit(pos, env.sun.vec);
    s.fade += ((show ? 1 : 0) - s.fade) * Math.min(1, dt * 1.5);
  }
}

// first time in the next two days the station is well up, sunlit, and the sky is dark
function findNextPass(el, fromMs) {
  let sunVec = null, sunAt = 0;
  for (let t = fromMs; t < fromMs + 48 * 3600000; t += 30000) {
    const d = Astro.days(t), lst = Astro.siderealTime(d, settings.lon), zenith = toVec(lst, settings.lat);
    if (!sunVec || t - sunAt > 600000) { sunVec = Astro.sun(d).vec; sunAt = t; }
    if (dot(sunVec, zenith) > sind(-5)) continue;
    const pos = Astro.satellitePosition(el, t), obs = Astro.observerPosition(settings.lat, lst);
    if (dot(norm([pos[0] - obs[0], pos[1] - obs[1], pos[2] - obs[2]]), zenith) > sind(12) && Astro.sunlit(pos, sunVec)) return t;
  }
  return 0;
}

function drawSatellites(now) {
  for (const s of realSats) {
    if (s.fade < 0.02 || !projectEnu(s.enu)) continue;
    const b = SPRITE_MAG - s.mag, size = Math.max(2.4, 5 + 7 * b) * unit;
    ctx.globalAlpha = clamp(0.6 + 0.12 * b, 0, 1) * s.fade * extinction(airmass(Math.max(0, s.up)));
    ctx.drawImage(sprites[3], pt.x - size / 2, pt.y - size / 2, size, size);
  }
  for (let i = satellites.length - 1; i >= 0; i--) {
    const s = satellites[i], p = (now - s.t0) / s.dur;
    if (p >= 1) { satellites.splice(i, 1); continue; }
    ctx.globalAlpha = 0.6 * Math.min(1, p * 8, (1 - p) * 8) * env.night;
    ctx.fillStyle = '#fff6e0';
    ctx.beginPath();
    ctx.arc(s.a[0] + (s.b[0] - s.a[0]) * p, s.a[1] + (s.b[1] - s.a[1]) * p, 1.1 * unit, 0, 6.2832);
    ctx.fill();
  }
}

function spawnSatellite(now) {
  const edge = () => {
    const e = Math.floor(Math.random() * 4), f = 0.1 + Math.random() * 0.8;
    return [[f * W, 0], [W, f * H], [f * W, H], [0, f * H]][e];
  };
  let a = edge(), b = edge();
  while (Math.hypot(a[0] - b[0], a[1] - b[1]) < Math.min(W, H) * 0.6) b = edge();
  satellites.push({ t0: now, dur: 28 + Math.random() * 22, a, b });
}

// ───────────────────────── aurora ─────────────────────────
// Driven by the planetary Kp index from NOAA. How strong a storm it takes depends on how far the
// observer is from the geomagnetic pole; from Canberra it needs a severe one.
// The Aurora setting adds a display on top of that, so there is something to see on a quiet night.
const aurora = { level: 0, kp: 0, live: 0 };

// The shader walks each line of sight up through the layer where aurora glows (95–310 km on a
// round Earth) and adds up the light of thin, folded, rippling sheets standing over the ground
// toward the pole. Because the sheets are defined on the ground and only their brightness changes
// with height, perspective produces the tall rays and the fan overhead by itself. Colours follow
// the real emissions: a purple nitrogen fringe at the foot, oxygen green, oxygen red at the top.
const auroraLayer = createShaderLayer(`
  uniform float uTime, uLevel, uPole, uGain;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { return 0.6 * noise(p) + 0.28 * noise(p * 2.1 + 13.0) + 0.12 * noise(p * 4.3 + 31.0); }
  // brightness of the sheets above a spot on the ground: x km east, y km toward the pole
  float sheets(vec2 g) {
    float across = g.y + 280.0 * (fbm(vec2(g.x / 650.0 + uTime * 0.004, 3.0)) - 0.5);   // the band meanders
    float d = across - mix(950.0, 170.0, uLevel);                                        // and comes overhead in a storm
    float band = exp(-d * d / 135000.0);
    float fold = d / 120.0 + 2.2 * fbm(vec2(g.x / 190.0 - uTime * 0.012, across / 420.0 + uTime * 0.003));
    float sheet = pow(1.0 - abs(fract(fold) - 0.5) * 2.0, 7.0);
    float rays = noise(vec2(g.x / 7.0 + uTime * 0.22, across / 95.0));
    rays = 0.25 + 0.75 * rays * rays * 2.0;
    float patch = smoothstep(0.22, 0.6, fbm(vec2(g.x / 430.0 + uTime * 0.006, across / 520.0 - uTime * 0.004)));
    return band * sheet * rays * patch;
  }
  void main() {
    vec3 e = direction();   // east, north, up
    if (e.z < 0.005) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    const float R = 6371.0;
    float jitter = hash(gl_FragCoord.xy);   // hides the steps between samples without flickering
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 40; i++) {
      float h = 95.0 + 215.0 * (float(i) + jitter) / 40.0;
      float root = sqrt(R * R * e.z * e.z + 2.0 * R * h + h * h), t = root - R * e.z;   // distance to that height
      float profile = smoothstep(95.0, 108.0, h) * exp(-(h - 108.0) / 65.0);
      vec3 tint = mix(vec3(0.22, 1.0, 0.42), vec3(0.95, 0.16, 0.3), smoothstep(150.0, 260.0, h));
      tint = mix(vec3(0.7, 0.28, 0.85), tint, smoothstep(96.0, 113.0, h));
      sum += sheets(vec2(e.x, e.y * uPole) * t) * profile * tint * min((R + h) / root, 6.0);   // slanted paths cross more glow
    }
    gl_FragColor = vec4(sum * uGain * 0.2 * smoothstep(0.0, 0.14, e.z), 1.0);
  }`, 4);

function updateAurora(dt) {
  const needed = (61.5 - Math.abs(Astro.geomagneticLatitude(settings.lat, settings.lon))) / 2.2;
  aurora.live = settings.online && Math.abs(timeOffset) < 3600000 ? clamp((aurora.kp - needed + 1) / 2, 0, 1) : 0;
  aurora.level += (Math.max(aurora.live, settings.aurora / 100) - aurora.level) * Math.min(1, dt * 0.4);
}

function drawAurora(t) {
  const strength = aurora.level * env.night;
  if (strength < 0.01) return;
  if (auroraLayer) {
    auroraLayer.set('uTime', t % 100000);
    auroraLayer.set('uLevel', aurora.level);
    auroraLayer.set('uPole', settings.lat < 0 ? -1 : 1);
    auroraLayer.set('uGain', env.night * (0.6 + 0.8 * aurora.level));
    auroraLayer.draw(view.V);
    return;
  }
  // no WebGL: plain curtains of rays toward the nearer pole, green low down fading to red
  const centre = settings.lat < 0 ? 180 : 0, COUNT = 80, SPAN = 120;
  ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
  ctx.lineWidth = SPAN / COUNT * RAD * view.s * 2.2;
  for (let i = 0; i < COUNT; i++) {
    const f = i / (COUNT - 1) - 0.5;
    const wave = Math.sin(i * 0.37 + t * 0.21) + Math.sin(i * 0.11 - t * 0.13 + 2) + 0.6 * Math.sin(i * 0.9 + t * 0.5);
    const a = strength * clamp(0.35 + 0.3 * wave, 0, 1) * Math.max(0, 1 - Math.abs(f) * 1.7);
    if (a < 0.02) continue;
    const base = 5 + 4 * Math.sin(i * 0.15 + t * 0.05);
    const top = base + (10 + 42 * aurora.level) * (0.65 + 0.35 * Math.sin(i * 0.23 + t * 0.17));
    if (!projectEnu(altAz(centre + f * SPAN, base))) continue;
    const x0 = pt.x, y0 = pt.y;
    if (!projectEnu(altAz(centre + f * SPAN, top))) continue;
    const ray = ctx.createLinearGradient(x0, y0, pt.x, pt.y);
    ray.addColorStop(0, 'rgba(110,255,150,0)');
    ray.addColorStop(0.1, `rgba(110,255,150,${a})`);
    ray.addColorStop(0.5, `rgba(90,230,170,${a * 0.5})`);
    ray.addColorStop(0.8, `rgba(210,90,140,${a * 0.25})`);
    ray.addColorStop(1, 'rgba(210,90,140,0)');
    ctx.strokeStyle = ray;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(pt.x, pt.y); ctx.stroke();
  }
}

// ───────────────────────── clouds ─────────────────────────
// One tileable noise field, thresholded by the cloud setting and drifted across in two layers.
const CLOUD_SIZE = 256;
const cloudTile = document.createElement('canvas'), cloudLayer = document.createElement('canvas');
const cloudCtx = cloudLayer.getContext('2d');
cloudTile.width = cloudTile.height = CLOUD_SIZE;
let cloudPattern = null;

const cloudNoise = (() => {
  const N = CLOUD_SIZE, out = new Float32Array(N * N), fade = t => t * t * (3 - 2 * t);
  let total = 0;
  for (let octave = 0, cells = 3, amp = 0.5; octave < 6; octave++, cells *= 2, amp *= 0.58) {
    const grid = Float32Array.from({ length: cells * cells }, Math.random);
    for (let y = 0; y < N; y++) {
      const gy = y / N * cells, y0 = Math.floor(gy), v = fade(gy - y0), y1 = (y0 + 1) % cells;
      for (let x = 0; x < N; x++) {
        const gx = x / N * cells, x0 = Math.floor(gx), u = fade(gx - x0), x1 = (x0 + 1) % cells;   // lattice wraps, so the tile repeats seamlessly
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1], c = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        out[y * N + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
      }
    }
    total += amp;
  }
  return out.map(v => v / total);
})();

function bakeClouds() {
  const g = cloudTile.getContext('2d'), img = g.createImageData(CLOUD_SIZE, CLOUD_SIZE), d = img.data;
  const threshold = 0.72 - 0.5 * settings.clouds / 100;
  for (let i = 0; i < cloudNoise.length; i++) {
    const t = clamp((cloudNoise[i] - threshold) / 0.16, 0, 1);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
    d[i * 4 + 3] = t * t * (3 - 2 * t) * 235;
  }
  g.putImageData(img, 0, 0);
  cloudPattern = cloudCtx.createPattern(cloudTile, 'repeat');
}

function drawClouds(t) {
  if (!settings.clouds || !cloudPattern) return;
  const q = cloudLayer.width / W, w = cloudLayer.width, h = cloudLayer.height;
  cloudCtx.globalCompositeOperation = 'source-over';
  cloudCtx.clearRect(0, 0, w, h);
  for (const [scale, vx, vy, alpha] of [[5, 5, 1.5, 1], [3.1, -3, 2.2, 0.6]]) {
    // stretched sideways, like sheets of cloud seen from below
    cloudPattern.setTransform(new DOMMatrix().translate(t * vx * unit * q, t * vy * unit * q).scale(scale * unit * q * 1.7, scale * unit * q));
    cloudCtx.globalAlpha = alpha; cloudCtx.fillStyle = cloudPattern;
    cloudCtx.fillRect(0, 0, w, h);
  }
  // at night clouds are dark shapes that blot out the stars, lit only by the Moon and the city;
  // by day they are white, with a warm tint around sunrise and sunset
  const day = clamp((env.sunAlt + 8) / 14, 0, 1), warm = day * (1 - day) * 2, m = moon.glow, g = env.glare;
  const colour = [10 + 26 * m + 46 * g, 11 + 28 * m + 36 * g, 15 + 34 * m + 28 * g]
    .map((v, k) => Math.round(clamp(v + (([236, 239, 245][k]) - v) * day + [40, 0, -30][k] * warm, 0, 255)));
  cloudCtx.globalCompositeOperation = 'source-in';
  cloudCtx.globalAlpha = 1; cloudCtx.fillStyle = `rgb(${colour})`;
  cloudCtx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.92 * (0.75 + 0.25 * Math.sin(t / 97));
  ctx.drawImage(cloudLayer, 0, 0, W, H);
}

// ───────────────────────── meteors ─────────────────────────
const METEOR_TINTS = [[255,255,255], [205,225,255], [190,255,222], [255,236,192]];
const meteors = [];
const radiant = { x: 0, y: 0, until: 0, away: true };   // made-up radiant for the Meteor shower button
let nextMeteor = 3, showerUntil = 0;

// Real annual showers: name, peak month and day, days active either side, radiant RA and Dec.
const SHOWERS = [
  ['Quadrantids', 1, 3, 3, 230, 49], ['Lyrids', 4, 22, 4, 271, 34], ['Eta Aquariids', 5, 6, 10, 338, -1],
  ['Delta Aquariids', 7, 30, 12, 340, -16], ['Perseids', 8, 12, 10, 48, 58], ['Orionids', 10, 21, 12, 95, 16],
  ['Leonids', 11, 17, 6, 152, 22], ['Geminids', 12, 14, 7, 112, 33],
].map(([name, month, day, span, ra, dec]) => ({ name, month, day, span, v: toVec(ra, dec) }));
let shower = null;

function updateShower() {
  const year = new Date(simTime).getUTCFullYear();
  shower = SHOWERS.find(s => Math.abs(simTime - Date.UTC(year, s.month - 1, s.day)) < s.span * 86400000) || null;
}
// where tonight's shower appears to come from on screen, if its radiant is above the horizon
function showerRadiant() {
  if (!shower || dot(view.HP.slice(6), shower.v) < 0.05) return null;
  const c = apply(view.C, shower.v);
  if (c[2] > -0.2) {
    const k = view.s * 2 / (1 + c[2]);
    return { x: view.cx + k * c[0], y: view.cy - k * c[1], away: true };
  }
  // radiant behind the view: the trails converge on the opposite point instead
  const k = view.s * 2 / (1 - c[2]);
  return { x: view.cx - k * c[0], y: view.cy + k * c[1], away: false };
}

function pickRadiant(now) {
  radiant.x = W * (-0.15 + Math.random() * 1.3);
  radiant.y = H * (-0.15 + Math.random() * 1.3);
  radiant.until = now + 180 + Math.random() * 240;
}

function meteorRate(now) {
  return now < showerUntil ? Math.max(settings.meteors, 6) * 10 : settings.meteors;
}
function scheduleMeteor(now) {
  const rate = meteorRate(now);
  nextMeteor = rate > 0 ? now + Math.max(0.15, -Math.log(1 - Math.random()) * 60 / rate) : Infinity;
}

function spawnMeteor(now, opts = {}) {
  const diag = Math.hypot(W, H);
  const fire = opts.fireball ?? Math.random() < 0.04;
  const x0 = W * (0.05 + Math.random() * 0.9), y0 = H * (0.05 + Math.random() * 0.9);
  const real = showerRadiant();
  let ang, scale = 1;
  if (opts.fromRadiant || (real && Math.random() < 0.6)) {
    // shower members streak away from the radiant; near it they look foreshortened
    const from = real || radiant, dx = x0 - from.x, dy = y0 - from.y;
    ang = Math.atan2(dy, dx) + (from.away ? 0 : Math.PI) + (Math.random() - 0.5) * 0.12;
    scale = clamp(Math.hypot(dx, dy) / (0.35 * diag), 0.35, 1);
  } else {
    ang = Math.random() * Math.PI * 2;
  }
  const len = diag * (0.09 + Math.random() * 0.22) * scale * (fire ? 1.5 : 1);
  const speed = diag * scale * (fire ? 0.25 + Math.random() * 0.15 : 0.35 + Math.random() * 0.55);
  const mag = fire ? 1 : 0.3 + 0.7 * Math.random() ** 2;
  meteors.push({
    t0: now, x0, y0, cx: Math.cos(ang), cy: Math.sin(ang), len, dur: len / speed, mag, fire,
    trail: len * (fire ? 0.9 : 0.35 + Math.random() * 0.35),
    glow: fire ? 2 + Math.random() * 2 : 0.25 + Math.random() * 0.4,
    w: (1.2 + mag * 2.2) * unit * (fire ? 2 : 1),
    head: (10 + mag * 26) * unit * (fire ? 1.8 : 1),
    col: fire ? [170, 255, 205] : pick(METEOR_TINTS),
  });
  if (settings.sounds) SkyAudio.meteor((x0 / W * 2 - 1) * (settings.mirror ? -1 : 1), mag, fire);
}

function drawMeteor(m, now, dim) {
  const t = now - m.t0, flying = t < m.dur, p = Math.min(1, t / m.dur);
  const q = flying ? 0 : (t - m.dur) / m.glow;
  if (q >= 1) return false;
  const env0 = Math.min(1, p / 0.12) * (1 - 0.6 * p ** 3);
  const a = flying ? env0 : 0.4 * (1 - q) ** 2;
  const hd = m.len * p, td = Math.max(0, hd - m.trail);
  const hx = m.x0 + m.cx * hd, hy = m.y0 + m.cy * hd;
  const [r, g, b] = m.col;

  if (hd - td > 0.5) {
    const tx = m.x0 + m.cx * td, ty = m.y0 + m.cy * td;
    const half = m.w * (1 + q * 0.8) / 2, nx = -m.cy * half, ny = m.cx * half;
    const grad = ctx.createLinearGradient(tx, ty, hx, hy);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},${0.45 * a})`);
    grad.addColorStop(1, flying ? `rgba(255,255,255,${a})` : `rgba(${r},${g},${b},${0.6 * a})`);
    ctx.globalAlpha = (0.45 + 0.55 * m.mag) * dim;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx + nx, hy + ny); ctx.lineTo(hx - nx, hy - ny);
    ctx.closePath(); ctx.fill();
  }
  if (flying) {
    const ha = env0 * (p < 0.85 ? 1 : (1 - p) / 0.15), s = m.head * (0.8 + 0.4 * env0);
    if (m.fire) {
      ctx.globalAlpha = 0.5 * ha * dim;
      ctx.drawImage(fireSprite, hx - s * 1.1, hy - s * 1.1, s * 2.2, s * 2.2);
    }
    ctx.globalAlpha = ha * m.mag * dim;
    ctx.drawImage(sprites[0], hx - s / 2, hy - s / 2, s, s);
  }
  if (m.fire) {
    // terminal flash as the fireball breaks up
    const ft = t - (m.dur - 0.06);
    if (ft > 0 && ft < 0.35) {
      const s = m.head * (2 + ft * 9);
      ctx.globalAlpha = 0.9 * (1 - ft / 0.35) ** 2 * dim;
      ctx.drawImage(fireSprite, hx - s / 2, hy - s / 2, s, s);
    }
  }
  return true;
}

// ───────────────────────── stars, planets, guide ─────────────────────────
function drawLines(alpha) {
  const C = view.C, Hm = view.HP, s = view.s, cx = view.cx, cy = view.cy, zMin = view.zMin, gap = 7 * unit;
  ctx.lineWidth = Math.max(1, 1.1 * unit); ctx.lineCap = 'round';
  ctx.strokeStyle = '#6f8fff'; ctx.globalAlpha = 0.32 * alpha;
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 6) {
    const ax = segs[i], ay = segs[i + 1], az = segs[i + 2], bx = segs[i + 3], by = segs[i + 4], bz = segs[i + 5];
    if (Hm[6] * ax + Hm[7] * ay + Hm[8] * az < 0.02 || Hm[6] * bx + Hm[7] * by + Hm[8] * bz < 0.02) continue;
    const adz = C[6] * ax + C[7] * ay + C[8] * az, bdz = C[6] * bx + C[7] * by + C[8] * bz;
    if (adz < zMin || bdz < zMin) continue;
    const ak = s * 2 / (1 + adz), bk = s * 2 / (1 + bdz);
    let x1 = cx + ak * (C[0] * ax + C[1] * ay + C[2] * az), y1 = cy - ak * (C[3] * ax + C[4] * ay + C[5] * az);
    let x2 = cx + bk * (C[0] * bx + C[1] * by + C[2] * bz), y2 = cy - bk * (C[3] * bx + C[4] * by + C[5] * bz);
    if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) continue;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > gap * 3) {
      // stop short of the stars so they stay crisp
      const ux = (x2 - x1) / len * gap, uy = (y2 - y1) / len * gap;
      x1 += ux; y1 += uy; x2 -= ux; y2 -= uy;
    }
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  }
  ctx.stroke();
}

function drawDim(t) {
  const C = view.C, Hm = view.HP, s = view.s, cx = view.cx, cy = view.cy, zMin = view.zMin, margin = 4 * unit;
  for (let k = 0; k < dimBuckets.length; k++) {
    const idx = dimBuckets[k], level = Math.floor(k / PHASES), ph = k % PHASES, vis = visible(LEVEL_MAG[level]);
    if (vis < 0.02) continue;
    const size = LEVEL_SIZE[level] * unit, half = size / 2, round = size > 2.2, minUp = LEVEL_MIN_UP[level];
    ctx.globalAlpha = LEVEL_ALPHA[level] * vis * (0.82 + 0.18 * Math.sin(t * (0.5 + 0.23 * ph) + ph * 1.7 + level));
    ctx.fillStyle = FAINT_TINTS[ph];
    ctx.beginPath();
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j] * 3, x = dimV[i], y = dimV[i + 1], z = dimV[i + 2];
      const dz = C[6] * x + C[7] * y + C[8] * z;
      if (dz < zMin || Hm[6] * x + Hm[7] * y + Hm[8] * z < minUp) continue;
      const kk = s * 2 / (1 + dz), px = cx + kk * (C[0] * x + C[1] * y + C[2] * z);
      if (px < -margin || px > W + margin) continue;
      const py = cy - kk * (C[3] * x + C[4] * y + C[5] * z);
      if (py < -margin || py > H + margin) continue;
      if (round) { ctx.moveTo(px + half, py); ctx.arc(px, py, half, 0, 6.2832); }
      else ctx.rect(px - half, py - half, size, size);
    }
    ctx.fill();
  }
}

function drawBright(t) {
  const C = view.C, Hm = view.HP, s = view.s, cx = view.cx, cy = view.cy, zMin = view.zMin, margin = 30 * unit;
  for (let i = 0; i < spriteCount; i++) {
    if (catMag[i] > env.limMag) break;   // sorted brightest first
    const x = catV[i * 3], y = catV[i * 3 + 1], z = catV[i * 3 + 2];
    const dz = C[6] * x + C[7] * y + C[8] * z;
    if (dz < zMin) continue;
    const up = Hm[6] * x + Hm[7] * y + Hm[8] * z;
    if (up < 0) continue;
    const kk = s * 2 / (1 + dz), px = cx + kk * (C[0] * x + C[1] * y + C[2] * z);
    if (px < -margin || px > W + margin) continue;
    const py = cy - kk * (C[3] * x + C[4] * y + C[5] * z);
    if (py < -margin || py > H + margin) continue;
    const b = SPRITE_MAG - catMag[i], air = airmass(up), f = catSpeed[i], ph = catPhase[i];
    const amp = Math.min(0.5, 0.04 + 0.055 * (air - 1));
    const flick = 0.5 * Math.sin(t * (9 + 5 * f) + ph) + 0.3 * Math.sin(t * (17 + 9 * f) + ph * 2.3)
      + 0.4 * Math.sin(t * (3.1 + f) + ph * 1.7);
    let tint = catTint[i];
    if (air > 2.2 && b > 2.9) {
      // bright stars low in the sky flash blue and red
      const c = Math.sin(t * (23 + 7 * f) + ph * 5);
      if (c > 0.72) tint = 2; else if (c < -0.72) tint = 5;
    }
    const size = (5 + 7 * b) * unit * (1 + 0.3 * amp * flick);
    ctx.globalAlpha = clamp((0.6 + 0.12 * b) * extinction(air) * (1 + amp * flick), 0, 1) * visible(catMag[i]);
    ctx.drawImage(sprites[tint], px - size / 2, py - size / 2, size, size);
  }
}

// planets shine steadily: they are tiny discs, not points, so the air barely makes them twinkle
function drawPlanets(t) {
  for (const p of Astro.PLANETS) {
    const shown = projectSky(p.vec);
    p.up = pt.up;
    if (!shown || p.up < 0 || p.mag > env.limMag || !onScreen(-40 * unit)) continue;
    const b = SPRITE_MAG - p.mag, air = airmass(p.up);
    const shimmer = 1 + Math.min(0.1, 0.012 * air) * Math.sin(t * 7.3 + b * 9);
    const size = Math.max(2.4, 5 + 7 * b) * unit;
    ctx.globalAlpha = clamp((0.6 + 0.12 * b) * extinction(air) * shimmer, 0, 1) * visible(p.mag);
    ctx.drawImage(p.sprite, pt.x - size / 2, pt.y - size / 2, size, size);
  }
}

function setSpacing(px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = px.toFixed(1) + 'px';
}
function drawLabels(alpha) {
  const font = (size, weight = '') => { ctx.font = `${weight} ${Math.round(size * unit)}px "Segoe UI", system-ui, sans-serif`; };
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  font(10.5, '600'); setSpacing(2.5 * unit);
  ctx.fillStyle = '#8fa9ff';
  for (const L of labels) {
    if (!projectSky(L.v) || pt.up < 0.03 || !onScreen(-60 * unit)) continue;
    ctx.globalAlpha = alpha * (L.rank === 1 ? 0.62 : 0.44) * Math.min(1, pt.up / 0.15);
    ctx.fillText(L.text, pt.x, pt.y);
  }
  ctx.textAlign = 'left';
  font(10); setSpacing(0.6 * unit);
  ctx.fillStyle = '#d5dcf0';
  for (const [i, name] of starNames) {
    if (catMag[i] > env.limMag || !projectSky(catV.subarray(i * 3, i * 3 + 3)) || pt.up < 0.03 || !onScreen(-20 * unit)) continue;
    ctx.globalAlpha = alpha * 0.55 * Math.min(1, pt.up / 0.15);
    ctx.fillText(name, pt.x + 8 * unit, pt.y + 9 * unit);
  }
  ctx.fillStyle = '#9fd8d0';
  if (env.limMag > 4.6) {
    for (const o of DEEP_SKY) {
      if (!projectSky(o.v) || pt.up < 0.05 || !onScreen(-20 * unit)) continue;
      ctx.globalAlpha = alpha * 0.5 * Math.min(1, pt.up / 0.15);
      ctx.fillText(o.name, pt.x + (o.glow ? 9 : -20) * unit, pt.y + (o.glow ? -8 : 0) * unit);
    }
  }
  ctx.fillStyle = '#ffd9a0';
  for (const p of Astro.PLANETS) {
    if (p.up < 0.03 || p.mag > env.limMag || !projectSky(p.vec) || !onScreen(-20 * unit)) continue;
    ctx.globalAlpha = alpha * 0.75 * Math.min(1, p.up / 0.15);
    ctx.fillText(p.name, pt.x + 9 * unit, pt.y - 9 * unit);
  }
  for (const s of realSats) {
    if (s.fade < 0.3 || !projectEnu(s.enu)) continue;
    ctx.globalAlpha = alpha * 0.75 * s.fade;
    ctx.fillText(s.name, pt.x + 9 * unit, pt.y - 9 * unit);
  }
  // compass letters: on the horizon when it is in view, otherwise at the edge of the picture
  ctx.textAlign = 'center';
  font(13, '600');
  ctx.globalAlpha = alpha * 0.6;
  for (const [letter, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    for (let alt = 3; alt < 88; alt += 3) {
      if (projectEnu(altAz(az, alt)) && onScreen(26 * unit)) {
        ctx.fillText(letter, pt.x, pt.y);
        break;
      }
    }
  }
  setSpacing(0);
}

// The horizon projects to a circle with the ground outside it: black earth under a faint band of
// sky glow. Only comes into view when the picture is tilted down or the field of view is very wide.
function drawGround() {
  const pts = [];
  for (let az = 0; az < 360; az += 3) {
    const c = apply(view.V, altAz(az, 0)), k = view.s * 2 / (1 + Math.max(c[2], -0.995));
    pts.push(view.cx + k * c[0], view.cy - k * c[1]);
  }
  const trace = () => {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  };
  // natural airglow in the outback, an orange dome over a city
  const g = env.glare;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgb(${Math.round(58 + 90 * g)},${Math.round(72 + 40 * g)},${Math.round(104 - 30 * g)})`;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.022 * (1 + 2.5 * g) * (0.25 + 0.75 * env.night);
  for (let degrees = 30; degrees >= 3; degrees -= 3) {
    ctx.lineWidth = degrees * RAD * view.s;
    trace(); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1; ctx.fillStyle = '#000';
  trace(); ctx.rect(-10, -10, W + 20, H + 20); ctx.fill('evenodd');
}

// ───────────────────────── tap to identify ─────────────────────────
let selected = null;

const formatKm = km => km >= 1e9 ? (km / 1e9).toFixed(2) + ' billion km' : km >= 1e7 ? Math.round(km / 1e6) + ' million km'
  : Math.round(km).toLocaleString() + ' km';
function moonPhaseName() {
  const pct = Math.round(moon.illum * 100), side = moon.waxing ? 'waxing' : 'waning';
  return pct < 2 ? 'new moon' : pct > 98 ? 'full moon'
    : pct < 47 ? side + ' crescent' : pct > 53 ? side + ' gibbous' : moon.waxing ? 'first quarter' : 'last quarter';
}

function identify(x, y) {
  const reach = 22 * unit;
  let best = null, bestDist = reach;
  // bigger and brighter things win ties: their distance is measured from their edge
  const consider = (px, py, radius, make) => {
    const d = Math.hypot(px - x, py - y) - radius;
    if (d < bestDist) { bestDist = d; best = make; }
  };
  if (moon.visible) {
    consider(moon.x, moon.y, moon.r + 8 * unit, () => ({
      title: 'Moon', radius: moon.r,
      lines: [`${Math.round(moon.illum * 100)}% lit · ${moonPhaseName()}`, `${Math.round(moon.km).toLocaleString()} km away`,
        moon.eclipsed > 0 ? 'Passing through Earth\'s shadow: a lunar eclipse.' : 'Earth\'s only natural satellite.'],
      pos: () => moon.visible ? [moon.x, moon.y] : null,
    }));
  }
  for (const s of realSats) {
    if (s.fade < 0.3 || !projectEnu(s.enu)) continue;
    consider(pt.x, pt.y, 12 * unit, () => ({
      title: s.name, lines: [`${Math.round(s.range).toLocaleString()} km from you · ${Math.round(s.height)} km high`, s.note],
      pos: () => s.fade > 0.05 && projectEnu(s.enu) ? [pt.x, pt.y] : null,
    }));
  }
  for (const p of Astro.PLANETS) {
    if (p.up < 0 || p.mag > env.limMag || !projectSky(p.vec)) continue;
    consider(pt.x, pt.y, 10 * unit, () => ({
      title: p.name, lines: [`Magnitude ${p.mag.toFixed(1)} · ${formatKm(p.dist * 149597871)} away`, PLANET_NOTES[p.name]],
      pos: () => projectSky(p.vec) && pt.up > 0 ? [pt.x, pt.y] : null,
    }));
  }
  if (env.limMag > 4.6) {
    for (const o of DEEP_SKY) {
      if (!projectSky(o.v) || pt.up < 0.03) continue;
      const radius = Math.max(8 * unit, o.size * 0.5 * RAD * view.s * pt.k);
      consider(pt.x, pt.y, Math.min(radius, 40 * unit) - (o.glow ? 0 : 20 * unit), () => ({
        title: o.name, radius: Math.min(radius, 60 * unit), lines: [`${o.kind} · ${o.distance} away`, o.note],
        pos: () => projectSky(o.v) && pt.up > 0 ? [pt.x, pt.y] : null,
      }));
    }
  }
  for (let i = 0; i < spriteCount && catMag[i] <= env.limMag; i++) {
    const v = catV.subarray(i * 3, i * 3 + 3);
    if (!projectSky(v) || pt.up < 0) continue;
    const name = starNames.get(i), facts = STAR_FACTS[name];
    consider(pt.x, pt.y, name ? 6 * unit : 0, () => ({
      title: name || 'Star',
      lines: [`Magnitude ${catMag[i].toFixed(1)} · ${COLOR_NAMES[catTint[i]]}`]
        .concat(facts ? [`${facts[0].toLocaleString()} light-years away`, facts[1]] : []),
      pos: () => projectSky(v) && pt.up > 0 ? [pt.x, pt.y] : null,
    }));
  }
  selected = best ? Object.assign(best(), { until: nowSec() + 14 }) : null;
}

function wrapText(text, maxWidth) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function drawSelection(now) {
  if (!selected) return;
  if (now > selected.until) { selected = null; return; }
  const p = selected.pos();
  if (!p) return;
  const fade = Math.min(1, (selected.until - now) / 1.5), ring = (selected.radius || 0) + 12 * unit;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 1.2 * unit; ctx.globalAlpha = 0.8 * fade;
  ctx.beginPath(); ctx.arc(p[0], p[1], ring, 0, 6.2832); ctx.stroke();

  const pad = 11 * unit, lineHeight = 16 * unit, bodyFont = `${Math.round(11.5 * unit)}px "Segoe UI", system-ui, sans-serif`;
  const titleFont = `600 ${Math.round(14 * unit)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; setSpacing(0.3 * unit);
  ctx.font = bodyFont;
  const body = selected.lines.filter(Boolean).flatMap(line => wrapText(line, 260 * unit));
  ctx.font = titleFont;
  const w = Math.max(ctx.measureText(selected.title).width, ...body.map(line => (ctx.font = bodyFont, ctx.measureText(line).width))) + pad * 2;
  const h = pad * 2 + lineHeight * (body.length + 1.3);
  let x = p[0] + ring + 10 * unit;
  if (x + w > W - 8) x = p[0] - ring - 10 * unit - w;
  const y = clamp(p[1] - h / 2, 8, H - h - 8);
  ctx.globalAlpha = 0.88 * fade; ctx.fillStyle = '#090d19';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8 * unit); else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.globalAlpha = 0.25 * fade; ctx.strokeStyle = '#a0b4ff'; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.font = titleFont; ctx.fillStyle = '#ffe4b8';
  ctx.fillText(selected.title, x + pad, y + pad);
  ctx.font = bodyFont; ctx.fillStyle = '#c9d2ea';
  body.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + lineHeight * (i + 1.3)));
  setSpacing(0);
}

// ───────────────────────── render loop ─────────────────────────
let last = 0, lastReadout = -10, lineAlpha = 0, nameAlpha = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.width = Math.round(window.innerWidth * dpr);
  H = canvas.height = Math.round(window.innerHeight * dpr);
  mwCanvas.width = Math.ceil(W * MW_SCALE); mwCanvas.height = Math.ceil(H * MW_SCALE);
  cloudLayer.width = Math.ceil(W / 4); cloudLayer.height = Math.ceil(H / 4);
  unit = Math.max(0.8, Math.min(W, H) / 1000);
  if (!radiant.until) pickRadiant(0);
}

function frame(ms) {
  // dt drives motion and is capped so nothing jumps after a pause; fades use the real elapsed time
  const now = ms / 1000, elapsed = Math.min(5, now - last), dt = Math.min(0.1, elapsed);
  last = now;
  timeOffset += dt * 1000 * (SPEEDS[speedIdx] - 1);
  simTime = Date.now() + timeOffset;
  const d = Astro.days(simTime);
  updateView(d);
  updateSunMoon(d);
  updateEnvironment();
  Astro.updatePlanets(d);
  updateSatellites(elapsed);
  updateAurora(elapsed);

  // the guide (figures and names) fades in while the mouse is in use, unless pinned on
  const peek = started && !document.body.classList.contains('idle'), ease = Math.min(1, elapsed * 2.5);
  lineAlpha += ((settings.lines || peek ? 1 : 0) - lineAlpha) * ease;
  nameAlpha += ((settings.names || peek ? 1 : 0) - nameAlpha) * ease;

  if (now > radiant.until) pickRadiant(now);
  if (now >= nextMeteor) {
    if (env.night > 0.2) spawnMeteor(now, { fromRadiant: now < showerUntil });
    scheduleMeteor(now);
  }
  if (now >= nextSatellite) {
    // without real orbits, satellites still only show in the hours after dusk and before dawn
    if (!realSats.length && env.night > 0.5 && (!settings.daylight || env.sunAlt > -40)) spawnSatellite(now);
    nextSatellite = now + 120 + Math.random() * 240;
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = env.bgCss;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'lighter';
  drawTwilight();
  drawMilkyWay();
  drawDeepSky();
  if (lineAlpha > 0.01) drawLines(lineAlpha);
  drawDim(now);
  drawBright(now);
  drawPlanets(now);
  drawSun();
  drawMoon();
  drawAurora(now);
  drawSatellites(now);
  for (let i = meteors.length - 1; i >= 0; i--) {
    if (!drawMeteor(meteors[i], now, env.night)) meteors.splice(i, 1);
  }
  drawClouds(now);
  drawGround();
  ctx.globalCompositeOperation = 'lighter';
  if (nameAlpha > 0.01) drawLabels(nameAlpha);
  drawSelection(now);

  if (settings.brightness < 100) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1 - settings.brightness / 100;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }
  if (now - lastReadout > (speedIdx ? 0.25 : 1)) { lastReadout = now; updateReadout(now); }
  requestAnimationFrame(frame);
}

// ───────────────────────── live data ─────────────────────────
// Satellite orbits (CelesTrak) once a day and the geomagnetic storm index (NOAA) every 20 minutes.
async function refreshOrbits() {
  const saved = loadJSON(TLE_KEY);
  if (saved) loadOrbits(saved);
  if (!settings.online || (saved && Date.now() - saved.t < 12 * 3600000)) return;
  const items = [];
  for (const [id] of SAT_LIST) {
    try {
      const text = await (await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=TLE`)).text();
      const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
      if (lines.length >= 3 && lines[1][0] === '1' && lines[2][0] === '2') items.push([id, lines[1], lines[2]]);
    } catch {}
  }
  if (items.length) { saveJSON(TLE_KEY, { t: Date.now(), items }); loadOrbits({ items }); }
}
async function refreshStormIndex() {
  if (!settings.online) return;
  try {
    const rows = await (await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')).json();
    const latest = rows[rows.length - 1], kp = parseFloat(Array.isArray(latest) ? latest[1] : latest.Kp ?? latest.kp_index);
    if (Number.isFinite(kp)) aurora.kp = kp;
  } catch {}
}
function refreshLiveData() { refreshOrbits(); refreshStormIndex(); }
setInterval(refreshStormIndex, 20 * 60000);
setInterval(refreshOrbits, 6 * 3600000);

// ───────────────────────── UI ─────────────────────────
const $ = id => document.getElementById(id);
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const FORMAT = {
  meteors: v => v + '/min', volume: v => v + '%', brightness: v => v + '%',
  darkness: v => v < 25 ? 'city' : v < 55 ? 'suburb' : v < 85 ? 'country' : 'outback',
  clouds: v => v ? v + '%' : 'clear', fov: v => v + '°', tilt: v => v === 90 ? 'overhead' : v + '°',
  facing: v => COMPASS[Math.round(v / 45) % 8] + ' ' + v + '°', moon: v => v + '×',
  aurora: v => v ? v + '%' : 'real only',
};
const TOGGLES = ['lines', 'names', 'daylight', 'online', 'mirror', 'sounds'];
const CITIES = [
  ['Canberra', -35.28, 149.13], ['Sydney', -33.87, 151.21], ['Melbourne', -37.81, 144.96], ['Perth', -31.95, 115.86],
  ['Auckland', -36.85, 174.76], ['Tokyo', 35.68, 139.69], ['Singapore', 1.35, 103.82], ['Cape Town', -33.92, 18.42],
  ['London', 51.51, -0.13], ['Reykjavik', 64.15, -21.94], ['New York', 40.71, -74.01], ['Los Angeles', 34.05, -118.24],
  ['Santiago', -33.45, -70.67],
];
const TIME_FORMAT = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
let started = false, idleTimer = 0, sleepAt = 0, sleepFade = 1;

function applySettings() {
  canvas.style.transform = settings.mirror ? 'scaleX(-1)' : '';
  SkyAudio.setVolume(settings.volume / 100 * sleepFade);
  for (const key in FORMAT) { $(key).value = settings[key]; $('o-' + key).textContent = FORMAT[key](settings[key]); }
  for (const key of TOGGLES) $(key).checked = settings[key];
  $('lat').value = settings.lat; $('lon').value = settings.lon;
  const city = CITIES.find(c => Math.abs(c[1] - settings.lat) < 0.02 && Math.abs(c[2] - settings.lon) < 0.02);
  $('city').value = city ? city[0] : '';
  $('speed').value = speedIdx; $('o-speed').textContent = SPEED_LABELS[speedIdx];
}
function change(key, value) {
  if (!(key in DEFAULTS) || typeof value !== typeof DEFAULTS[key] || Number.isNaN(value)) return;
  const input = $(key);
  if (input && input.type === 'range') value = clamp(value, +input.min, +input.max);
  settings[key] = value;
  if (key === 'meteors') scheduleMeteor(nowSec());
  if (key === 'clouds') bakeClouds();
  if (key === 'online' && value) refreshLiveData();
  if (key === 'lat' || key === 'lon') lastPassCheck = -1e9;
  applySettings(); saveJSON(STORE_KEY, settings);
  remote.dirty = true;
}
function setLocation(lat, lon) {
  settings.lat = clamp(+lat || 0, -90, 90);
  change('lon', clamp(+lon || 0, -180, 180));
}
function setSpeed(index) { speedIdx = clamp(Math.round(index) || 0, 0, SPEEDS.length - 1); applySettings(); remote.dirty = true; }
function goLive() { speedIdx = 0; timeOffset = 0; lastReadout = -10; applySettings(); remote.dirty = true; }
function goToTime(ms) {
  if (!Number.isFinite(ms)) return;
  // the planet and Moon formulas are only good for a few centuries around now
  timeOffset = clamp(ms, Date.UTC(1800, 0, 1), Date.UTC(2100, 0, 1)) - Date.now();
  speedIdx = 0; lastReadout = -10; lastPassCheck = -1e9;
  applySettings(); remote.dirty = true;
}

// when the sky will next be dark enough for stars, searching ahead in five-minute steps
function nextDark() {
  for (let t = simTime; t < simTime + 86400000; t += 300000) {
    const d = Astro.days(t);
    if (dot(Astro.sun(d).vec, toVec(Astro.siderealTime(d, settings.lon), settings.lat)) < sind(-6)) return t;
  }
  return 0;
}
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function updateReadout(now) {
  updateShower();
  if (realSats.length && now - lastPassCheck > 600) {
    lastPassCheck = now;
    issPass = findNextPass(realSats[0].el, simTime);
  }
  const ns = settings.lat < 0 ? 'S' : 'N', ew = settings.lon < 0 ? 'W' : 'E';
  const simulated = speedIdx || Math.abs(timeOffset) > 1000;
  const parts = [
    `${Math.abs(settings.lat).toFixed(2)}°${ns} ${Math.abs(settings.lon).toFixed(2)}°${ew}`,
    new Date(simTime).toLocaleString([], TIME_FORMAT) + (simulated ? ' (simulated)' : ''),
  ];
  if (settings.daylight && env.trueSunAlt > -6) {
    const dark = nextDark();
    parts.push((env.trueSunAlt > 0 ? 'Daylight' : 'Twilight') + (dark ? `: stars from about ${clock(dark)}` : ''));
  }
  parts.push(`Moon ${Math.round(moon.illum * 100)}% lit, ${moonPhaseName()}, `
    + (moon.alt > 0 ? Math.round(moon.alt) + '° above the horizon' : 'below the horizon'));
  if (moon.shadowSep < moon.penumbra + MOON_RADIUS_DEG) {
    parts.push(moon.eclipsed >= 1 ? 'Total lunar eclipse' : moon.eclipsed > 0 ? 'Partial lunar eclipse' : 'Moon in Earth\'s outer shadow');
  }
  const up = Astro.PLANETS.filter(p => p.up > 0.03 && p.mag < 6.5);
  parts.push('Planets up: ' + (up.map(p => p.name).join(', ') || 'none'));
  // anything bright sitting within four degrees of something else
  const bodies = up.filter(p => p.mag < 2.5).map(p => [p.name, apply(view.HP, p.vec)]);
  if (moon.alt > 0) bodies.unshift(['the Moon', moon.enu]);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (dot(bodies[i][1], bodies[j][1]) > cosd(4)) parts.push(`${bodies[i][0]} and ${bodies[j][0]} are close together`.replace(/^t/, 'T'));
    }
  }
  if (shower) parts.push(shower.name + ' meteor shower active');
  const overhead = realSats.filter(s => s.fade > 0.5).map(s => s.name);
  if (overhead.length) parts.push(overhead.join(' and ') + ' passing over now');
  else if (issPass) parts.push('Next ISS pass ' + new Date(issPass).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }));
  if (aurora.live > 0.05) parts.push(`Real aurora storm in progress (Kp ${aurora.kp.toFixed(1)})`);
  if (sleepAt) {
    // the music fades out over the last three minutes of the sleep timer
    const fade = clamp((sleepAt - Date.now()) / 180000, 0, 1);
    if (fade !== sleepFade) { sleepFade = fade; SkyAudio.setVolume(settings.volume / 100 * fade); }
    parts.push(fade > 0 ? 'Music fades out by ' + clock(sleepAt) : 'Music off (sleep timer)');
  }
  if (remote.url) parts.push('Phone remote: ' + remote.url);
  remote.status = parts.join('  ·  ');
  $('readout').textContent = remote.status;
  if (remote.on) pushRemoteState();
}

for (const key in FORMAT) $(key).addEventListener('input', e => change(key, +e.target.value));
for (const key of TOGGLES) $(key).addEventListener('change', e => change(key, e.target.checked));
$('lat').addEventListener('change', e => setLocation(e.target.value, settings.lon));
$('lon').addEventListener('change', e => setLocation(settings.lat, e.target.value));
$('speed').addEventListener('input', e => setSpeed(+e.target.value));
for (const [name] of CITIES) $('city').add(new Option(name, name));
$('city').addEventListener('change', e => {
  const city = CITIES.find(c => c[0] === e.target.value);
  if (city) setLocation(city[1], city[2]);
});
$('go').addEventListener('click', () => goToTime(new Date($('when').value).getTime()));

function locate() {
  const button = $('locate'), reset = () => { button.textContent = 'Locate me'; };
  if (!navigator.geolocation) { button.textContent = 'Not available'; setTimeout(reset, 2500); return; }
  button.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(pos => {
    setLocation(pos.coords.latitude.toFixed(2), pos.coords.longitude.toFixed(2));
    reset();
  }, () => { button.textContent = 'Location blocked'; setTimeout(reset, 2500); }, { timeout: 10000 });
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
function startShower() {
  const now = nowSec();
  showerUntil = now + 25;
  scheduleMeteor(now);
}
function toggleAurora() { change('aurora', settings.aurora ? 0 : DEFAULTS.aurora); }
function setSleepTimer(minutes) {
  sleepAt = minutes > 0 ? Date.now() + minutes * 60000 : 0;
  sleepFade = 1; lastReadout = -10;
  $('sleep').value = String(minutes > 0 ? minutes : 0);
  applySettings();
}
async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch {}
}
function begin() {
  if (started) return;
  started = true;
  SkyAudio.start();
  keepAwake();
  $('intro').classList.add('gone');
  document.body.classList.remove('intro');
  if (!document.fullscreenElement) toggleFullscreen();
  wake();
}
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (started && !$('panel').matches(':hover, :focus-within')) document.body.classList.add('idle');
    else if (started) wake();
  }, 3500);
}
const ACTIONS = {
  meteor: () => spawnMeteor(nowSec(), { fireball: false }), fireball: () => spawnMeteor(nowSec(), { fireball: true }),
  shower: startShower, aurora: toggleAurora, live: goLive, mute: () => SkyAudio.toggleMute(), fullscreen: toggleFullscreen,
};

$('intro').addEventListener('click', begin);
$('fs').addEventListener('click', toggleFullscreen);
$('shower').addEventListener('click', startShower);
$('sleep').addEventListener('change', e => setSleepTimer(+e.target.value));
$('live').addEventListener('click', goLive);
$('locate').addEventListener('click', locate);
canvas.addEventListener('click', e => {
  if (!started) return;
  const box = canvas.getBoundingClientRect(), x = (e.clientX - box.left) / box.width * W;
  identify(settings.mirror ? W - x : x, (e.clientY - box.top) / box.height * H);
});
window.addEventListener('mousemove', wake);
window.addEventListener('pointerdown', wake);
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (started && document.visibilityState === 'visible') { keepAwake(); SkyAudio.start(); }
});
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey || /^(number|datetime-local|select-one)$/.test(e.target.type)) return;
  const key = e.key.toLowerCase();
  if (!started) { if (key === 'enter' || key === ' ') { e.preventDefault(); begin(); } return; }
  if (key === 'f') toggleFullscreen();
  else if (key === 'm') SkyAudio.toggleMute();
  else if (key === 'c') change('lines', !settings.lines);
  else if (key === 'n') change('names', !settings.names);
  else if (key === 'd') change('daylight', !settings.daylight);
  else if (key === 'l') goLive();
  else if (key === 'a') toggleAurora();
  else if (key === 's') startShower();
  else if (key === 'b') ACTIONS.fireball();
  else if (key === ' ') { e.preventDefault(); ACTIONS.meteor(); }
});

// ───────────────────────── phone remote ─────────────────────────
// Only when the page is served by khonshu_server.py: it relays commands from remote.html on a
// phone, and this page reports its settings back so the remote's sliders start in the right place.
const remote = { on: false, since: -1, url: '', status: '', dirty: true, lastPush: 0 };

function runCommand(c) {
  if (c.set && typeof c.set === 'object') {
    for (const key in c.set) {
      if (key === 'lat') setLocation(c.set.lat, c.set.lon ?? settings.lon);
      else if (key !== 'lon') change(key, c.set[key]);
    }
  }
  if (typeof c.speed === 'number') setSpeed(c.speed);
  if (typeof c.time === 'number') goToTime(c.time);
  if (typeof c.sleep === 'number') setSleepTimer(c.sleep);
  if (typeof c.action === 'string' && Object.hasOwn(ACTIONS, c.action) && started) ACTIONS[c.action]();
}
function pushRemoteState() {
  const now = Date.now();
  if (!remote.dirty && now - remote.lastPush < 5000) return;
  remote.dirty = false; remote.lastPush = now;
  fetch('api/state', { method: 'POST', body: JSON.stringify({ settings, speed: speedIdx, status: remote.status, started }) }).catch(() => {});
}
async function pollRemote() {
  try {
    const reply = await (await fetch('api/poll?since=' + remote.since)).json();
    remote.since = reply.latest;
    reply.commands.forEach(runCommand);
  } catch {}
  setTimeout(pollRemote, 700);
}
async function connectRemote() {
  if (!location.protocol.startsWith('http')) return;
  try {
    const info = await (await fetch('api/state')).json();
    remote.on = true; remote.url = info.remote || '';
    pollRemote();
  } catch {}
}

resize();
bakeClouds();
applySettings();
refreshLiveData();
connectRemote();
requestAnimationFrame(frame);
})();
