// The Khonshu voyage: an imagined journey of about fourteen minutes. The view lifts off the
// ground, passes through a wormhole to Saturn, a nebula, a point outside the Milky Way and a
// black hole, and comes home. Built to be watched half asleep: every change is slow.
//
// Each place is a fragment shader working in camera space (x right, y up, z into the picture),
// added on top of the star field that js/sky.js keeps drawing underneath.
(() => {
'use strict';
const sky = window.KhonshuSky;
if (!sky || !sky.visions) return;
const { fx, view, ctx } = sky;
const { RAD, clamp, dot, cross, norm } = Astro;
const { smooth, fromCamera, screenCircle, setHole, clearHole } = sky.visions;
const CAMERA = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const NOISE = `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < 5; i++) { sum += amp * noise(p); p = p * 2.02 + 11.0; amp *= 0.5; }
    return sum;
  }`;

// ───────────────────────── the places ─────────────────────────
// A tunnel of light: streaks rushing out from a bright point far ahead.
const tunnelLayer = sky.createShaderLayer(NOISE + `
  uniform float uTime, uFade;
  void main() {
    vec3 e = direction();
    float off = acos(clamp(e.z, -1.0, 1.0));                  // angle from the middle of the picture
    vec2 around = normalize(e.xy + vec2(1e-5));
    float depth = 0.55 / (off + 0.03) + uTime * 1.6;           // distance down the tunnel, rushing toward us
    float streaks = pow(noise(vec3(around * 5.0, depth * 0.6)), 4.0) * 6.0
      + pow(noise(vec3(around * 17.0, depth * 1.7 + 9.0)), 6.0) * 9.0;
    vec3 colour = mix(vec3(0.55, 0.7, 1.0), vec3(0.75, 0.5, 1.0), noise(vec3(around * 2.0, depth * 0.2)));
    vec3 light = colour * streaks * (0.6 + 0.4 * sin(depth * 5.0)) * smoothstep(0.02, 0.5, off)
      + vec3(0.9, 0.95, 1.0) * exp(-off * 9.0) * 1.2;          // the far end
    gl_FragColor = vec4(light * 0.5 * uFade, 1.0);             // kept dim: this is meant to be watched in the dark
  }`, [4, 3, 2]);

// Saturn from close by: a banded globe lit from one side, with its rings and the shadows they
// and the globe cast on each other. Distances are in units of the planet's radius.
const saturnLayer = sky.createShaderLayer(NOISE + `
  uniform vec3 uPlanet, uAxis, uSun; uniform float uRadius, uTime, uFade;
  float rings(float r) {
    float c = smoothstep(1.24, 1.30, r) * (1.0 - smoothstep(1.50, 1.53, r)) * 0.22;   // the faint inner ring
    float b = smoothstep(1.52, 1.56, r) * (1.0 - smoothstep(1.93, 1.95, r)) * 0.95;   // the bright middle one
    float a = smoothstep(2.02, 2.04, r) * (1.0 - smoothstep(2.25, 2.27, r)) * 0.65;   // the outer, past the dark gap
    return (a + b + c) * (0.8 + 0.2 * sin(r * 140.0) * sin(r * 53.0));
  }
  void main() {
    vec3 e = direction(), P = uPlanet / sin(uRadius);
    float along = dot(P, e), miss2 = dot(P, P) - along * along;
    float globeAt = miss2 < 1.0 && along > 0.0 ? along - sqrt(1.0 - miss2) : -1.0;
    // the rings lie in the plane of the equator
    float slope = dot(e, uAxis), ringAt = abs(slope) > 1e-4 ? dot(P, uAxis) / slope : -1.0;
    vec3 ringLight = vec3(0.0);
    float ringCover = 0.0;
    if (ringAt > 0.0) {
      vec3 q = e * ringAt - P;
      ringCover = rings(length(q));
      float sunward = dot(q, uSun);
      bool shaded = sunward < 0.0 && length(q - uSun * sunward) < 1.0;      // behind the globe from the Sun
      ringLight = vec3(0.86, 0.78, 0.62) * ringCover * (shaded ? 0.05 : 1.0);
    }
    vec3 light = ringLight;
    if (globeAt > 0.0) {
      vec3 n = e * globeAt - P;
      float lat = dot(n, uAxis);
      float band = noise(vec3(lat * 8.0 + 0.25 * noise(n * 3.0 + uTime * 0.01), 3.0, 0.5));
      vec3 surface = mix(vec3(0.80, 0.68, 0.46), vec3(0.96, 0.88, 0.70), band);
      surface = mix(surface, vec3(0.62, 0.64, 0.60), smoothstep(0.72, 0.96, abs(lat)));
      float sun = pow(max(dot(n, uSun), 0.0), 0.75);
      float down = dot(uSun, uAxis);
      if (abs(down) > 1e-3) {
        // follow the sunlight back from this spot to see whether the rings are in the way
        float reach = -lat / down;
        if (reach > 0.0) sun *= 1.0 - 0.75 * rings(length(n + uSun * reach));
      }
      vec3 globe = surface * sun;
      light = ringAt > 0.0 && ringAt < globeAt ? ringLight + globe * (1.0 - ringCover) : globe;
    }
    gl_FragColor = vec4(light * uFade, 1.0);
  }`, [3, 2, 1.5]);

// Inside a cloud of glowing gas, drifting slowly forward.
const nebulaLayer = sky.createShaderLayer(NOISE + `
  uniform float uTime, uFade;
  void main() {
    vec3 p = direction() * 2.3 + vec3(0.0, 0.0, uTime * 0.012);
    float cloud = fbm(p), wisp = fbm(p * 2.7 + 5.0), dust = fbm(p * 1.4 - 8.0);
    vec3 colour = mix(vec3(1.0, 0.28, 0.36), vec3(0.2, 0.85, 0.8), smoothstep(0.4, 0.62, wisp));   // hydrogen red, oxygen teal
    colour = mix(colour, vec3(0.3, 0.45, 1.0), smoothstep(0.55, 0.75, fbm(p * 0.8 + 21.0)) * 0.6); // starlight scattered blue
    float gas = smoothstep(0.38, 0.75, cloud) * (0.25 + 1.3 * wisp * wisp);
    gl_FragColor = vec4(colour * gas * (1.0 - 0.8 * smoothstep(0.5, 0.68, dust)) * 0.55 * uFade, 1.0);
  }`, [4, 3, 2]);

// The Milky Way from outside: a tilted spiral disc with a bulge of old stars at its heart.
const galaxyLayer = sky.createShaderLayer(NOISE + `
  uniform vec3 uCore, uPole; uniform float uTime, uFade;
  void main() {
    vec3 e = direction(), C = uCore * 2.3;                      // 2.3 galaxy radii away
    float slope = dot(e, uPole), at = abs(slope) > 1e-4 ? dot(C, uPole) / slope : -1.0;
    vec3 light = vec3(0.0);
    if (at > 0.0) {
      vec3 q = e * at - C;
      float r = length(q);
      vec3 ax = normalize(cross(uPole, vec3(0.31, 0.87, 0.38))), ay = cross(uPole, ax);
      float wind = 2.0 * atan(dot(q, ay), dot(q, ax)) - 7.0 * log(r + 0.06) + uTime * 0.01;   // two trailing arms
      float arm = pow(0.5 + 0.5 * cos(wind), 2.2), lane = pow(0.5 + 0.5 * cos(wind + 0.7), 6.0);
      float disc = exp(-r * 3.2) * smoothstep(1.05, 0.7, r), inner = smoothstep(0.08, 0.3, r);
      vec3 colour = mix(vec3(1.0, 0.86, 0.62), vec3(0.62, 0.74, 1.0), smoothstep(0.08, 0.35, r));  // old stars within, young ones out in the arms
      light = colour * disc * (0.3 + 1.6 * arm * inner) * (0.6 + 0.8 * noise(q * 9.0)) * (1.0 - 0.55 * lane * inner);
      light += vec3(1.0, 0.35, 0.5) * disc * arm * smoothstep(0.82, 0.95, noise(q * 30.0)) * 2.0;  // glowing gas clouds
    }
    float away = acos(clamp(dot(e, uCore), -1.0, 1.0));
    light += vec3(1.0, 0.84, 0.6) * (exp(-away * away / 0.006) * 1.6 + exp(-away / 0.12) * 0.25);
    gl_FragColor = vec4(light * 0.9 * uFade, 1.0);
  }`, [3, 2, 1.5]);

// Where things sit in the picture: directions in camera space.
const SATURN = { planet: norm([0.16, -0.06, 1]), axis: norm([0.38, 0.88, -0.28]), sun: norm([-0.55, 0.3, -0.78]) };
const GALAXY = { core: norm([-0.1, 0.05, 1]), pole: norm([0.25, 0.75, 0.6]) };

// What each place does to the stars behind it: `foreign` swaps in an unfamiliar sky, `milkyWay`
// scales the Milky Way band, `starCut` hides the faintest stars.
const PLACES = {
  saturn: { label: 'arriving at Saturn', milkyWay: 1, starCut: 0 },   // still our own sky: Saturn is a neighbour
  nebula: { label: 'drifting through a nebula', foreign: true, milkyWay: 0.5, starCut: 0.5 },
  galaxy: { label: 'looking back at the Milky Way from outside', foreign: true, milkyWay: 0, starCut: 3.5 },
  hole: { label: 'orbiting a black hole', foreign: true, milkyWay: 1.3, starCut: 0 },
  home: { label: 'coming home', milkyWay: 1, starCut: 0 },
};
// [kind, seconds, where a jump leads]
const LEGS = [
  ['lift', 45], ['jump', 22, 'saturn'], ['saturn', 150], ['jump', 22, 'nebula'], ['nebula', 150],
  ['jump', 22, 'galaxy'], ['galaxy', 150], ['jump', 22, 'hole'], ['hole', 170], ['jump', 22, 'home'], ['land', 45],
];

// A rotation followed by a mirror flip: every constellation becomes unrecognisable.
function foreignSky() {
  const a = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]), b = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
  const along = dot(a, b), second = norm([b[0] - along * a[0], b[1] - along * a[1], b[2] - along * a[2]]), third = cross(a, second);
  return [...a, ...second, -third[0], -third[1], -third[2]];
}

// ───────────────────────── the journey ─────────────────────────
// trip.place is where we are (null until the first wormhole); trip.hold freezes it for inspection.
let trip = null;

function arrive(place, now) {
  const info = PLACES[place];
  trip.place = place; trip.since = now;
  fx.warp = info.foreign ? foreignSky() : null;
  fx.milkyWay = info.milkyWay; fx.starCut = info.starCut;
  if (place !== 'hole') clearHole();
  sky.audio.swell();
  sky.refreshStatus();
}
function finish() {
  trip = null;
  fx.lift = 0; fx.warp = null; fx.milkyWay = 1; fx.starCut = 0;
  clearHole();
  sky.audio.setTravel(0);
  sky.refreshStatus();
}
function begin(hold) {
  if (sky.settings.sleepLock) return;
  if (trip || fx.lift > 0) return;
  sky.visions.stop();
  trip = { t0: sky.now(), place: null, since: 0, tunnel: 0, leg: 0, q: 0, hold };
  sky.audio.setTravel(1);
  sky.refreshStatus();
}
// pressing the key again part-way through heads straight for the last wormhole and home
function toggle() {
  if (!trip) { begin(); return; }
  const before = LEGS.slice(0, LEGS.length - 2).reduce((sum, leg) => sum + leg[1], 0);
  if (sky.now() - trip.t0 < before) { trip.t0 = sky.now() - before; trip.hold = null; }
}

fx.update.push(now => {
  if (!trip) return;
  // find which leg we are in, and how far through it
  let index = 0, q = 0;
  if (trip.hold) { index = trip.hold.leg; q = trip.hold.q; }
  else {
    let t = now - trip.t0;
    while (index < LEGS.length && t >= LEGS[index][1]) t -= LEGS[index++][1];
    if (index >= LEGS.length) { finish(); return; }
    q = t / LEGS[index][1];
  }
  const [kind, , leadsTo] = LEGS[index];
  if (index !== trip.leg) sky.refreshStatus();
  trip.leg = index; trip.q = q; trip.tunnel = 0;
  if (kind === 'lift') fx.lift = smooth(0, 1, q);
  else if (kind === 'land') fx.lift = 1 - smooth(0, 1, q);
  else fx.lift = 1;
  if (kind === 'jump') {
    trip.tunnel = Math.pow(Math.sin(Math.PI * q), 0.6);
    if (q >= 0.5 && trip.place !== leadsTo) arrive(leadsTo, now);   // the sky changes while the tunnel hides it
  } else if (trip.hold && PLACES[kind] && trip.place !== kind) arrive(kind, now - 60);

  if (trip.place === 'hole') {
    // a slow orbit: the hole wanders a little and its disc tips toward us
    const turn = now * 0.02, shadow = (7 + 3 * q) * RAD;
    const where = fromCamera(norm([0.2 * Math.cos(turn), 0.09 * Math.sin(turn) - 0.04, 1]));
    setHole(where, shadow, 1, fromCamera(norm([0.12 * Math.sin(turn * 0.7), 1, -(0.16 + 0.26 * q)])));
  }
});

fx.foreground.push(now => {
  if (!trip) return;
  const place = trip.place, time = now % 10000;
  // each place fades up as the tunnel that brought us clears
  const fade = place ? smooth(0, 7, now - trip.since) : 0;
  if (place === 'saturn' && saturnLayer) {
    const radius = (11 + 5 * (LEGS[trip.leg][0] === 'saturn' ? trip.q : 0)) * RAD;   // drawing closer
    const disc = screenCircle(SATURN.planet, radius);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(disc.x, disc.y, disc.r, 0, 6.2832); ctx.fill();   // the globe hides the stars behind it
    ctx.globalCompositeOperation = 'lighter';
    saturnLayer.set('uPlanet', ...SATURN.planet); saturnLayer.set('uAxis', ...SATURN.axis); saturnLayer.set('uSun', ...SATURN.sun);
    saturnLayer.set('uRadius', radius); saturnLayer.set('uTime', time); saturnLayer.set('uFade', fade);
    saturnLayer.draw(CAMERA);
  } else if (place === 'nebula' && nebulaLayer) {
    nebulaLayer.set('uTime', time); nebulaLayer.set('uFade', fade);
    nebulaLayer.draw(CAMERA);
  } else if (place === 'galaxy' && galaxyLayer) {
    galaxyLayer.set('uCore', ...GALAXY.core); galaxyLayer.set('uPole', ...GALAXY.pole);
    galaxyLayer.set('uTime', time); galaxyLayer.set('uFade', fade);
    galaxyLayer.draw(CAMERA);
  }
  if (trip.tunnel > 0.01) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.94 * trip.tunnel; ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, sky.W, sky.H);
    ctx.globalCompositeOperation = 'lighter';
    if (tunnelLayer) {
      tunnelLayer.set('uTime', time); tunnelLayer.set('uFade', trip.tunnel);
      tunnelLayer.draw(CAMERA);
    }
  }
});

// ───────────────────────── controls and status ─────────────────────────
sky.actions.voyage = toggle;
fx.keys.v = toggle;

fx.status.push(() => {
  if (!trip) return '';
  const kind = LEGS[trip.leg][0];
  return 'Imagined voyage: ' + (kind === 'lift' ? 'leaving Earth' : kind === 'jump' ? 'in the wormhole'
    : kind === 'land' ? 'coming home' : PLACES[kind].label);
});

// For checking one place at a chosen moment: add ?voyage=saturn&at=0.5 to the address
// (lift, jump, saturn, nebula, galaxy, hole or land).
function hold(kind, q) {
  const leg = LEGS.findIndex(entry => entry[0] === kind);
  if (leg < 0) return false;
  if (trip) finish();
  begin({ leg, q: clamp(q, 0, 0.999) });
  return true;
}
const query = new URLSearchParams(location.search);
if (query.get('voyage')) {
  const wait = () => (sky.started ? hold(query.get('voyage'), +query.get('at') || 0.5) : setTimeout(wait, 300));
  wait();
}

sky.voyage = { toggle, hold, finish };
})();
