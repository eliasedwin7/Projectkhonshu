// Khonshu visions: things that are not really overhead (a black hole, a supernova, a great
// comet), two that are real but easy to miss (the zodiacal light, a replay of the next lunar
// eclipse), and a telescope view of the planets and the Moon.
//
// Everything here works through the `fx` hooks that js/sky.js exposes on window.KhonshuSky. The
// status line always says when something on screen is imagined.
(() => {
'use strict';
const sky = window.KhonshuSky;
if (!sky) return;
const { fx, settings, view, pt, env, moon, ctx } = sky;
const { RAD, sind, cosd, clamp, dot, cross, norm, apply, toVec } = Astro;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// direction in the sky (J2000) that a camera-space direction is looking at: right, up, forward
const fromCamera = c => { const C = view.C; return [C[0] * c[0] + C[3] * c[1] + C[6] * c[2], C[1] * c[0] + C[4] * c[1] + C[7] * c[2], C[2] * c[0] + C[5] * c[1] + C[8] * c[2]]; };
const slerp = (a, b, t) => {
  const angle = Math.acos(clamp(dot(a, b), -1, 1));
  if (angle < 1e-5) return a;
  const wa = Math.sin((1 - t) * angle), wb = Math.sin(t * angle);
  return norm([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
};

// ───────────────────────── black hole ─────────────────────────
// The hole itself and its glowing disc are a shader that follows each ray of light as gravity
// bends it (the classic 1.5·h²/r⁵ pull that reproduces light paths round a non-spinning hole,
// in units of the hole's own radius). A ray that reaches the hole is black; one that crosses
// the plane of the disc picks up its light, so the far side of the disc appears lifted over the
// top and under the bottom. The stars and Milky Way behind are bent by js/sky.js.
const holeLayer = sky.createShaderLayer(`
  uniform vec3 uHole, uNormal; uniform float uShadow, uTime, uGain;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec3 e = direction();
    float D = 2.6 / uShadow;                       // how far away the hole is, in hole radii
    float along = D * dot(e, uHole);
    float miss2 = D * D - along * along;           // squared closest approach of the straight ray
    const float REACH = 16.0;
    if (along < 0.0 || miss2 > REACH * REACH) { gl_FragColor = vec4(0.0); return; }
    vec3 p = e * (along - sqrt(REACH * REACH - miss2)) - uHole * D, v = e;
    vec3 swing = cross(p, v);
    float h2 = dot(swing, swing);
    vec3 ax1 = normalize(cross(uNormal, uHole)), ax2 = cross(uNormal, ax1);
    vec3 light = vec3(0.0);
    float cover = 0.0;
    for (int i = 0; i < 90; i++) {
      float r2 = dot(p, p), r = sqrt(r2);
      if (r < 1.0) { cover = 1.0; break; }                         // fallen in
      if (r > REACH + 0.5 && dot(p, v) > 0.0) break;               // escaped
      float dt = clamp(0.1 * r, 0.03, 1.0);
      v -= 1.5 * h2 * p / (r2 * r2 * r) * dt;
      vec3 q = p + v * dt;
      float a = dot(p, uNormal), b = dot(q, uNormal);
      if (a * b < 0.0) {
        vec3 hit = mix(p, q, a / (a - b));
        float rc = length(hit);
        if (rc > 3.0 && rc < 11.0) {
          // gas orbits faster nearer the hole, so the pattern shears as it turns
          float turn = uTime * 0.5 * pow(3.0 / rc, 1.5), ct = cos(turn), st = sin(turn);
          vec2 d2 = vec2(dot(hit, ax1), dot(hit, ax2));
          d2 = vec2(d2.x * ct - d2.y * st, d2.x * st + d2.y * ct);
          float streaks = 0.55 * noise(d2 * 1.1) + 0.45 * noise(d2 * 3.3 + 7.0);
          float glow = pow(3.0 / rc, 2.2) * smoothstep(3.0, 3.6, rc) * smoothstep(11.0, 7.5, rc);
          // the side turning toward us is brighter than the side turning away
          float toward = dot(normalize(cross(uNormal, hit)), -normalize(v));
          glow *= (0.45 + 1.1 * streaks) * pow(1.0 + 0.55 * toward, 3.0);
          light += mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.9, 0.72), smoothstep(8.0, 3.2, rc)) * glow * (1.0 - cover);
          cover = max(cover, min(0.85, glow * 1.4));
        }
      }
      p = q;
    }
    gl_FragColor = vec4(light * uGain, 1.0);
  }`, [4, 3, 2]);

// A circle on the sky is a circle on screen in this projection. Given its centre in camera space
// and its angular radius, returns where to draw it.
function screenCircle(c, radius) {
  const off = Math.acos(clamp(c[2], -1, 1)), reach = 2 * view.s, across = Math.hypot(c[0], c[1]) || 1;
  // the nearer edge comes out negative when the middle of the picture lies inside the circle
  const far = reach * Math.tan(Math.min(off + radius, 3) / 2), near = reach * Math.tan((off - radius) / 2), mid = (far + near) / 2;
  return { x: view.cx + mid * c[0] / across, y: view.cy - mid * c[1] / across, r: (far - near) / 2 };
}

// Place a black hole at a J2000 direction with a shadow of the given angular radius (radians).
// A hole whose shadow is that big bends starlight out to a much wider ring: θE = √(shadow / 1.3).
const hole = { strength: 0, normal: [0, 1, 0] };
function setHole(direction, shadow, strength, normal) {
  const lens = fx.lens;
  hole.strength = strength;
  lens.on = shadow > 1e-4 && strength > 0.001;
  if (!lens.on) return;
  lens.v = direction; lens.shadow = shadow; lens.einstein = Math.sqrt(shadow / 1.3);
  if (normal) hole.normal = normal;
  else {
    // a disc seen nearly edge-on, fixed among the stars
    const side = norm(cross(direction, [0.3, 0.2, 0.93])), up = cross(direction, side);
    hole.normal = norm([direction[0] * 0.15 + up[0], direction[1] * 0.15 + up[1], direction[2] * 0.15 + up[2]]);
  }
}
function clearHole() { fx.lens.on = false; hole.strength = 0; }

fx.foreground.push(now => {
  if (!fx.lens.on) return;
  // the shadow: no light comes from inside it, so it hides whatever is drawn behind
  const centre = apply(view.C, fx.lens.v);
  if (centre[2] > view.zMin) {
    const disc = screenCircle(centre, fx.lens.shadow);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, hole.strength * 2); ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(disc.x, disc.y, disc.r, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
  }
  if (!holeLayer) return;
  holeLayer.set('uHole', ...fx.lens.v);
  holeLayer.set('uNormal', ...hole.normal);
  holeLayer.set('uShadow', fx.lens.shadow);
  holeLayer.set('uTime', now % 10000);
  holeLayer.set('uGain', hole.strength);
  holeLayer.draw(view.C);
});

// ───────────────────────── the visions ─────────────────────────
// Each has a length in seconds, start() returning false if it cannot run right now,
// update(p, now) with p running 0 → 1, and end().
const VISIONS = {
  blackhole: {
    label: 'a black hole drifting past', seconds: 260,
    start() {
      // cross the picture on a line that passes near its centre
      const angle = Math.random() * Math.PI * 2, off = (Math.random() - 0.5) * 0.25, far = Math.sin(38 * RAD), near = Math.cos(38 * RAD);
      const across = [Math.cos(angle), Math.sin(angle)], sideways = [-across[1] * off, across[0] * off];
      this.from = fromCamera(norm([across[0] * far + sideways[0], across[1] * far + sideways[1], near]));
      this.to = fromCamera(norm([-across[0] * far + sideways[0], -across[1] * far + sideways[1], near]));
      return true;
    },
    update(p) {
      const strength = smooth(0, 0.14, p) * (1 - smooth(0.86, 1, p));
      setHole(slerp(this.from, this.to, p), 3 * RAD * strength, strength);
    },
    end: clearHole,
  },
  supernova: {
    label: 'a star exploding as a supernova', seconds: 240,
    start() {
      const inView = i => sky.projectSky(sky.catV.subarray(i * 3, i * 3 + 3)) && pt.up > 0.2 && sky.onScreen(40 * sky.unit);
      const names = [...sky.starNames];
      // the two red supergiants that really are near the end of their lives, if either is up
      const pick = names.find(([i, name]) => (name === 'Betelgeuse' || name === 'Antares') && inView(i)) || names.find(([i]) => inView(i));
      if (!pick) return false;
      [this.index, this.name] = pick;
      this.label = this.name + ' exploding as a supernova';
      return true;
    },
    update(p) {
      // a fast rise, a short plateau, then a long fade back to the star it was
      this.shape = p < 0.08 ? smooth(0, 0.08, p) : p < 0.3 ? 1 : Math.pow(1 - (p - 0.3) / 0.7, 1.6);
      const usual = sky.catMag[this.index];
      fx.nova = { index: this.index, mag: usual + (-7.5 - usual) * this.shape };
    },
    end() { fx.nova = null; this.shape = 0; },
  },
};
let active = null, nextAt = 0, cometWanted = false;

function stopVision() {
  if (active) active.vision.end();
  active = null;
  sky.refreshStatus();
}
// `freeze`, if given, holds the vision at that point (0–1) for inspection
function startVision(name, freeze) {
  const vision = VISIONS[name];
  if (!vision || fx.lift > 0) return false;
  stopVision();
  if (!vision.start()) return false;
  active = { name, vision, t0: sky.now(), freeze };
  sky.audio.swell();
  sky.refreshStatus();
  return true;
}
const toggleVision = name => (active && active.name === name ? stopVision() : startVision(name));

fx.update.push(now => {
  if (active) {
    const p = active.freeze ?? (now - active.t0) / active.vision.seconds;
    if (p >= 1) stopVision(); else active.vision.update(p, now);
    return;
  }
  // left to themselves, visions come only at night, with long gaps between them
  const gap = settings.visions === 'often' ? [300, 600] : [1200, 2400];
  if (settings.visions === 'off' || !sky.started || fx.lift > 0) { nextAt = 0; return; }
  if (!nextAt) nextAt = now + gap[0] + Math.random() * (gap[1] - gap[0]);
  if (now >= nextAt) {
    nextAt = 0;
    if (env.night > 0.8) startVision(Math.random() < 0.6 ? 'blackhole' : 'supernova');
  }
});

// extra glare round the supernova, beyond what one star sprite can show
fx.foreground.push(() => {
  const nova = VISIONS.supernova;
  if (!active || active.vision !== nova || !nova.shape) return;
  if (!sky.projectSky(sky.catV.subarray(nova.index * 3, nova.index * 3 + 3)) || pt.up < 0) return;
  const r = (40 + 190 * nova.shape) * sky.unit;
  ctx.globalAlpha = 0.55 * nova.shape;
  ctx.drawImage(sky.blobs.blue, pt.x - r, pt.y - r, r * 2, r * 2);
});

// ───────────────────────── great comet ─────────────────────────
// Invented, but it behaves like a real one: it keeps to the evening side of the Sun, shifts a
// little every night, and its tails point away from the Sun. It comes for about three weeks at a
// time when visions are on, or whenever it is called up by hand.
const cometSprite = sky.buildBlob([190, 235, 225]), ionSprite = sky.buildBlob([120, 170, 255]);
function cometShowing(d) {
  if (cometWanted) return true;
  if (settings.visions === 'off') return false;
  return ((Math.floor(d) % (settings.visions === 'often' ? 45 : 110)) + 110) % 110 < 20;
}
fx.foreground.push(() => {
  const d = Astro.days(sky.simTime);
  const seen = env.night * (1 - fx.lift) * clamp((env.limMag - 2.5) / 3, 0, 1);
  if (seen < 0.02 || !cometShowing(d)) return;
  const sun = Astro.sun(d), sunEnu = apply(view.H, sun.vec);
  const head = apply(view.H, Astro.eclipticToEquatorial(sun.lon + 62 + 14 * Math.sin(d / 9), 8 + 28 * Math.sin(d / 13 + 1.3), d));
  if (head[2] < 0.02) return;
  // unit direction along the sky pointing straight away from the Sun
  const toward = dot(head, sunEnu);
  const away = norm([head[0] * toward - sunEnu[0], head[1] * toward - sunEnu[1], head[2] * toward - sunEnu[2]]);
  const sideways = cross(head, away), scale = RAD * view.s;
  const tail = (sprite, length, curve, width, flare, strength) => {
    for (let k = 1; k <= 46; k++) {
      const f = k / 46, along = length * f * RAD, bend = curve * f * f * RAD;
      const dir = [away[0] * Math.cos(bend) + sideways[0] * Math.sin(bend), away[1] * Math.cos(bend) + sideways[1] * Math.sin(bend), away[2] * Math.cos(bend) + sideways[2] * Math.sin(bend)];
      const point = [head[0] * Math.cos(along) + dir[0] * Math.sin(along), head[1] * Math.cos(along) + dir[1] * Math.sin(along), head[2] * Math.cos(along) + dir[2] * Math.sin(along)];
      if (point[2] < 0 || !sky.projectEnu(point)) continue;
      const r = (width + flare * f) * scale * pt.k;
      ctx.globalAlpha = strength * seen * Math.pow(1 - f, 1.5) * Math.min(1, point[2] / 0.12);
      ctx.drawImage(sprite, pt.x - r, pt.y - r, r * 2, r * 2);
    }
  };
  tail(cometSprite, 24, 34, 0.8, 3.2, 0.11);   // dust: broad, pale and curved
  tail(ionSprite, 30, 0, 0.45, 0.9, 0.07);     // gas: thin, blue and straight
  if (!sky.projectEnu(head)) return;
  const x = pt.x, y = pt.y, coma = 2.2 * scale * pt.k, core = 16 * sky.unit, low = Math.min(1, head[2] / 0.12);
  ctx.globalAlpha = 0.5 * seen * low;
  ctx.drawImage(cometSprite, x - coma, y - coma, coma * 2, coma * 2);
  ctx.globalAlpha = seen * low;
  ctx.drawImage(sky.sprites[0], x - core / 2, y - core / 2, core, core);
});

// ───────────────────────── zodiacal light (real) ─────────────────────────
// Sunlight scattered by dust in the plane of the planets: a faint cone leaning up from where the
// Sun set, or will rise. It needs a properly dark sky, so it only shows far from city lights.
fx.backdrop.push(() => {
  const seen = env.night * (1 - fx.lift) * clamp((env.limMag - 6.4) / 1.2, 0, 1);
  if (seen < 0.02) return;
  const d = Astro.days(sky.simTime), sun = Astro.sun(d);
  for (const side of [-1, 1]) {
    for (let away = 18; away <= 78; away += 5) {
      const dir = apply(view.H, Astro.eclipticToEquatorial(sun.lon + side * away, 0, d));
      if (dir[2] < -0.05 || !sky.projectEnu(dir)) continue;
      const r = (13 - away * 0.09) * RAD * view.s * pt.k;
      ctx.globalAlpha = 0.085 * seen * Math.exp(-away / 30) * clamp((dir[2] + 0.05) / 0.2, 0, 1);
      ctx.drawImage(sky.blobs.warm, pt.x - r, pt.y - r, r * 2, r * 2);
    }
  }
});

// ───────────────────────── eclipse replay (real) ─────────────────────────
// Finds the next lunar eclipse the chosen place can see, jumps to just before it, and plays it
// at a minute a second. Then it returns to the present.
let replay = null;
function shadowState(ms) {
  const d = Astro.days(ms), m = Astro.moon(d), s = Astro.sun(d);
  const sep = Math.acos(clamp(-dot(m.vec, s.vec), -1, 1)) / RAD, parallax = Math.asin(1 / m.dist) / RAD;
  const umbra = 1.02 * (0.99834 * parallax - 0.2666 / s.dist + 0.0024);
  const up = dot(m.vec, toVec(Astro.siderealTime(d, settings.lon), settings.lat));
  return { sep, umbra, penumbra: umbra + 2 * 1.02 * 0.2666 / s.dist, up };
}
function replayEclipse() {
  if (replay) { replay = null; sky.goLive(); return; }
  const HOUR = 3600000, from = Date.now();
  for (let t = from; t < from + 6 * 365.25 * 24 * HOUR; t += HOUR) {
    const now = shadowState(t);
    if (now.sep > 12) { t += Math.floor((now.sep - 8) / 0.55) * HOUR; continue; }   // nowhere near full Moon: skip ahead
    if (now.sep > now.umbra + 0.26 || now.up < sind(10)) continue;
    // found one in progress and in the sky; step out to where the Moon enters and leaves the shadow
    let begin = t, end = t;
    for (let s = shadowState(begin); s.sep < s.penumbra + 0.4; s = shadowState(begin -= 300000));
    for (let s = shadowState(end); s.sep < s.penumbra + 0.4; s = shadowState(end += 300000));
    replay = { end, began: sky.now(), date: new Date(t).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) };
    sky.goToTime(begin); sky.setSpeed(2);
    sky.select(sky.describeMoon(), 20);
    return;
  }
  replay = null;
}
fx.update.push(now => {
  if (!replay) return;
  if (sky.simTime > replay.end) { replay = null; sky.goLive(); }
  // someone pressed Live time part-way through
  else if (now - replay.began > 2 && Math.abs(sky.simTime - Date.now()) < 5000) { replay = null; sky.refreshStatus(); }
});

// ───────────────────────── telescope ─────────────────────────
// Clicking a planet or the Moon opens a round eyepiece view in the middle of the picture, with
// celestial north up and east to the left, as the naked-eye sky has it.
const POLES = { Jupiter: toVec(268.057, 64.495), Saturn: toVec(40.589, 83.537) };   // where their north poles point
const BANDS = {
  Jupiter: ['#b9a184', '#e2d2b6', '#a8805f', '#ead9bd', '#c9b08e', '#e8dcc6', '#b08a66', '#e6d5b8', '#a99a86'],
  Saturn: ['#b7a57c', '#d9c89d', '#c8b486', '#e6d6ab', '#d2bf92', '#e2d2a6', '#c2ae80'],
};
const DISCS = { Mercury: [0.13, '#b9b2a8'], Venus: [0.3, '#fff6dc'], Mars: [0.17, '#e0794a'], Uranus: [0.09, '#a9e6e2'] };
let eyepiece = null;

fx.onSelect = item => {
  eyepiece = item && (item.kind === 'planet' || item.kind === 'moon') ? { item, t0: sky.now() } : null;
  if (eyepiece) item.until = sky.now() + 30;
};

// position angle (east of north, radians) of the direction from a planet toward another point
function positionAngle(planet, toward) {
  const pole = [0, 0, 1], along = dot(pole, planet);
  const north = norm([pole[0] - along * planet[0], pole[1] - along * planet[1], pole[2] - along * planet[2]]), east = norm(cross(pole, planet));
  return Math.atan2(dot(toward, east), dot(toward, north));
}
// turn the canvas so that "up" points along a position angle, with east to the left
const turnTo = angle => ctx.rotate(-angle);

function drawBanded(name, r, flattening) {
  const bands = BANDS[name], ry = r * flattening;
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, 6.2832); ctx.clip();
  bands.forEach((colour, k) => { ctx.fillStyle = colour; ctx.fillRect(-r, -ry + 2 * ry * k / bands.length, 2 * r, 2 * ry / bands.length + 1); });
  // darker toward the edge, as a ball lit from the front
  const shade = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = shade; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
}

function drawSaturn(p, R) {
  const r = R * 0.3, pole = POLES.Saturn, tilt = Math.asin(clamp(-dot(pole, p.vec), -1, 1));   // how far the rings open to us
  turnTo(positionAngle(p.vec, pole));
  const open = Math.abs(Math.sin(tilt));
  const rings = () => {
    // from the outside in: the A ring, the dark Cassini division, the bright B ring, the faint C ring
    for (const [outer, inner, colour] of [[2.27, 2.03, 'rgba(206,188,148,0.8)'], [1.95, 1.53, 'rgba(232,214,172,0.95)'], [1.52, 1.24, 'rgba(150,136,108,0.4)']]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * outer, r * outer * open, 0, 0, 6.2832);
      ctx.ellipse(0, 0, r * inner, r * inner * open, 0, 0, 6.2832);
      ctx.fillStyle = colour; ctx.fill('evenodd');
    }
  };
  rings();
  drawBanded('Saturn', r, 0.9);
  // the half of the rings on our side passes in front of the planet
  ctx.save();
  ctx.beginPath(); ctx.rect(-R, tilt > 0 ? 0 : -R, 2 * R, R); ctx.clip();
  rings();
  ctx.restore();
  return `Rings open ${(Math.abs(tilt) / RAD).toFixed(1)}° to us, showing their ${tilt > 0 ? 'north' : 'south'} face`;
}

function drawJupiter(p, R) {
  const r = R * 0.15, d = Astro.days(sky.simTime);
  turnTo(positionAngle(p.vec, POLES.Jupiter));
  // the moons range out to 26 Jupiter radii, so their distances are squeezed to fit the view
  const place = x => Math.sign(x) * (Math.abs(x) <= 1 ? Math.abs(x) * r : r + (Math.abs(x) - 1) * (R * 0.9 - r) / 26);
  const moons = Astro.jupiterMoons(d), size = Math.max(1.6, R * 0.014);
  const drawMoons = near => {
    ctx.fillStyle = '#f2ead8';
    for (const m of moons) {
      if (m.near !== near || (!near && Math.hypot(m.x, m.y) < 1)) continue;   // hidden behind the planet
      ctx.beginPath(); ctx.arc(place(m.x), -place(m.y), size, 0, 6.2832); ctx.fill();
    }
  };
  drawMoons(false);
  drawBanded('Jupiter', r, 0.935);
  drawMoons(true);
  const order = [...moons].sort((a, b) => b.x - a.x).map(m => m.name).join(', ');
  return `Moons from west to east: ${order}. Their spacing is squeezed to fit.`;
}

function drawPhase(p, R) {
  const [size, colour] = DISCS[p.name], r = R * size, lit = (1 + cosd(p.phase)) / 2;
  const sun = Astro.sun(Astro.days(sky.simTime)).vec;
  // the bright edge faces the Sun
  ctx.rotate(Math.atan2(-Math.cos(positionAngle(p.vec, sun)), -Math.sin(positionAngle(p.vec, sun))));
  ctx.fillStyle = '#15161a';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  if (lit < 0.5) ctx.ellipse(0, 0, r * (1 - 2 * lit), r, 0, Math.PI / 2, -Math.PI / 2, true);
  else ctx.ellipse(0, 0, r * (2 * lit - 1), r, 0, Math.PI / 2, Math.PI * 1.5, false);
  ctx.closePath();
  ctx.fillStyle = colour; ctx.fill();
  return `${Math.round(lit * 100)}% of the disc is lit`;
}

fx.overlay.push(now => {
  if (!eyepiece) return;
  const item = eyepiece.item, left = item.until - now;
  if (left <= 0) { eyepiece = null; return; }
  const W = sky.W, H = sky.H, unit = sky.unit, R = Math.min(W, H) * 0.24, cx = W / 2, cy = H / 2 - R * 0.12;
  const fade = Math.min(1, (now - eyepiece.t0) / 0.6, left / 1.2);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = fade;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832);
  ctx.fillStyle = '#020308'; ctx.fill();
  ctx.lineWidth = 2 * unit; ctx.strokeStyle = 'rgba(160,180,255,0.35)'; ctx.stroke();
  ctx.save();
  ctx.clip();
  let note = '';
  if (item.kind === 'moon') {
    sky.drawMoonAt(cx, cy, R * 0.72, 1);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade;
  } else {
    ctx.translate(cx, cy);
    const p = item.planet;
    note = p.name === 'Saturn' ? drawSaturn(p, R) : p.name === 'Jupiter' ? drawJupiter(p, R) : drawPhase(p, R);
  }
  ctx.restore();
  // caption under the eyepiece
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.round(15 * unit)}px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = '#ffe4b8';
  ctx.fillText(item.title + ' through a telescope', cx, cy + R + 12 * unit);
  ctx.font = `${Math.round(11.5 * unit)}px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = '#c9d2ea';
  sky.wrapText(note, R * 2.4).forEach((line, k) => ctx.fillText(line, cx, cy + R + (34 + 16 * k) * unit));
  ctx.restore();
});

// ───────────────────────── controls and status ─────────────────────────
Object.assign(sky.actions, {
  blackhole: () => toggleVision('blackhole'), supernova: () => toggleVision('supernova'),
  comet: () => { cometWanted = !cometWanted; sky.refreshStatus(); }, eclipse: replayEclipse,
});
Object.assign(fx.keys, { k: sky.actions.blackhole, u: sky.actions.supernova, o: sky.actions.comet, e: sky.actions.eclipse });
for (const button of document.querySelectorAll('#panel button[data-vision]')) {
  button.addEventListener('click', () => sky.actions[button.dataset.vision]());
}

fx.status.push(() => {
  const parts = [];
  if (active) parts.push('Imagined: ' + active.vision.label);
  if (cometShowing(Astro.days(sky.simTime)) && fx.lift === 0) parts.push('Imagined: a great comet in the evening sky');
  if (replay) parts.push(`Replaying the real lunar eclipse of ${replay.date}`);
  return parts.join('  ·  ');
});

// For checking a vision at a chosen moment: add ?vision=blackhole&at=0.5 to the address.
const query = new URLSearchParams(location.search);
if (VISIONS[query.get('vision')]) {
  const hold = () => (sky.started ? startVision(query.get('vision'), clamp(+query.get('at') || 0.5, 0, 0.999)) : setTimeout(hold, 300));
  hold();
}
if (query.get('vision') === 'comet') cometWanted = true;

sky.visions = { start: startVision, stop: stopVision, setHole, clearHole, fromCamera, screenCircle, slerp, smooth };
})();
