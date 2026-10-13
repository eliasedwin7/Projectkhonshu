// Sleep music for the Khonshu night sky: slow, organ-like chords drifting over a deep drone and a
// soft wash of noise, synthesised live so it never loops. Nothing has a sharp start, and every
// note beats gently against a slightly detuned twin. A separate layer of night sounds (crickets,
// frogs, an owl) can be mixed in.
const SkyAudio = (() => {
'use strict';

let ac = null, master, verb, padBus, natureBus, noiseBuf, muted = false, volume = 0.6, nature = 0, current = 0;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
// D major, voiced low and open: Dsus2, Bm11, Gmaj9, Em11, A7sus4, F#m11
const CHORDS = [
  [38, 45, 52, 57, 64], [35, 42, 50, 57, 64], [31, 43, 50, 57, 66],
  [40, 47, 52, 57, 62], [33, 45, 52, 55, 62], [42, 49, 52, 57, 64],
];
const NEXT = [[1, 2, 3], [2, 5, 0], [0, 3, 4], [0, 2, 4], [0, 1], [2, 1]];

const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
const filter = (type, freq, q) => {
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f;
};
const lfo = (freq, depth, param) => {
  const o = ac.createOscillator(); o.frequency.value = freq;
  o.connect(gain(depth)).connect(param); o.start();
};

function impulse(seconds) {
  const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      y += 0.3 * (Math.random() * 2 - 1 - y);   // one-pole lowpass for a dark tail
      d[i] = y * Math.pow(1 - i / len, 2.4);
    }
  }
  return buf;
}

function start() {
  if (ac) { ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = gain(0);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.ratio.value = 2.5; comp.attack.value = 0.2; comp.release.value = 1;
  master.connect(comp).connect(ac.destination);

  verb = ac.createConvolver(); verb.buffer = impulse(9);
  verb.connect(gain(0.9)).connect(master);

  padBus = filter('lowpass', 620, 0.2);
  padBus.connect(gain(0.5)).connect(master);
  padBus.connect(gain(0.9)).connect(verb);
  lfo(0.011, 180, padBus.frequency);

  noiseBuf = ac.createBuffer(1, ac.sampleRate * 5, ac.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // the hush of empty space: a low rumble and a trace of high air, both breathing slowly
  [['lowpass', 260, 0.3, 0.026, 0.03], ['bandpass', 2200, 0.4, 0.004, 0.017]].forEach(([type, freq, q, level, rate]) => {
    const src = ac.createBufferSource(), g = gain(level);
    src.buffer = noiseBuf; src.loop = true;
    src.connect(filter(type, freq, q)).connect(g);
    g.connect(master); g.connect(verb);
    lfo(rate, level * 0.55, g.gain);
    src.start(0, Math.random() * 4);
  });

  // drone
  [[38, 0.045, 0.023], [45, 0.02, 0.037], [50, 0.022, 0.051]].forEach(([m, g, rate]) => {
    const o = ac.createOscillator(), og = gain(g);
    o.frequency.value = mtof(m);
    o.connect(og).connect(padBus);
    lfo(rate, g * 0.4, og.gain);
    o.start();
  });

  startNature();
  master.gain.setTargetAtTime(targetGain(), ac.currentTime, 4);
  chord(0);
  setTimeout(shimmer, 30000);
}

// ───────────────────────── night sounds ─────────────────────────
// Crickets, frogs, a boobook owl and leaves in the wind, all synthesised. They share one bus so
// a single slider mixes them against the music.

// an oscillator turned into an on/off gate that is open for the given share of each cycle
function gate(freq, duty, param) {
  const o = ac.createOscillator(), shaper = ac.createWaveShaper(), curve = new Float32Array(257);
  const threshold = Math.cos(Math.PI * duty);
  for (let i = 0; i < 257; i++) curve[i] = clamp((i / 128 - 1 - threshold) / 0.15, 0, 1);
  shaper.curve = curve; o.frequency.value = freq;
  o.connect(shaper).connect(param); o.start();
}

function startNature() {
  natureBus = gain(nature);
  natureBus.connect(master);
  natureBus.connect(gain(0.35)).connect(verb);

  // crickets: a high tone gated twice over, by the buzz of the wings and by the rhythm of the chirps
  for (let i = 0; i < 6; i++) {
    const carrier = ac.createOscillator(), wings = gain(0), rhythm = gain(0), level = 0.006 + Math.random() * 0.006;
    const out = gain(level), pan = ac.createStereoPanner();
    carrier.frequency.value = 3900 + Math.random() * 1400;
    pan.pan.value = Math.random() * 1.8 - 0.9;
    gate(26 + Math.random() * 12, 0.5, wings.gain);
    gate(1.3 + Math.random() * 1.5, 0.3 + Math.random() * 0.15, rhythm.gain);
    carrier.connect(wings).connect(rhythm).connect(out).connect(pan).connect(natureBus);
    lfo(0.02 + Math.random() * 0.05, level * 0.8, out.gain);   // each one drifts in and out
    carrier.start();
  }

  // leaves stirring
  const rustle = ac.createBufferSource(), leaves = gain(0.004);
  rustle.buffer = noiseBuf; rustle.loop = true;
  rustle.connect(filter('bandpass', 1800, 0.7)).connect(leaves).connect(natureBus);
  lfo(0.07, 0.0022, leaves.gain); lfo(0.031, 0.0016, leaves.gain);
  rustle.start(0, Math.random() * 4);

  setTimeout(frog, 9000);
  setTimeout(owl, 70000);
}

// a few creaking croaks: a slow sawtooth ringing a narrow filter
function frog() {
  const t0 = ac.currentTime + 0.05, count = 2 + Math.floor(Math.random() * 4), gap = 0.32 + Math.random() * 0.1;
  const o = ac.createOscillator(), g = gain(0), pan = ac.createStereoPanner();
  o.type = 'sawtooth'; o.frequency.value = 24 + Math.random() * 8;
  pan.pan.value = Math.random() * 1.8 - 0.9;
  g.gain.setValueAtTime(0, t0);
  for (let k = 0; k < count; k++) {
    const t = t0 + k * gap;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.03);
    g.gain.linearRampToValueAtTime(0, t + 0.2);
  }
  o.connect(filter('bandpass', 520 + Math.random() * 260, 7)).connect(g).connect(pan).connect(natureBus);
  o.start(t0); o.stop(t0 + count * gap + 0.3);
  o.onended = () => pan.disconnect();
  setTimeout(frog, (6 + Math.random() * 16) * 1000);
}

// the two-note "boo-book" of the southern boobook, repeated a few times from somewhere far off
function owl() {
  const t0 = ac.currentTime + 0.1, calls = 3 + Math.floor(Math.random() * 4), pan = ac.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(natureBus);
  let last = null;
  for (let k = 0; k < calls * 2; k++) {
    const t = t0 + Math.floor(k / 2) * 1.9 + (k % 2) * 0.42, freq = k % 2 ? 470 : 560;
    const o = last = ac.createOscillator(), g = gain(0);
    o.frequency.setValueAtTime(freq, t);
    o.frequency.linearRampToValueAtTime(freq * 0.96, t + 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(g).connect(pan);
    o.start(t); o.stop(t + 0.4);
  }
  last.onended = () => pan.disconnect();
  setTimeout(owl, (150 + Math.random() * 240) * 1000);
}

// two soft notes, used to announce a satellite pass
function chime() {
  if (!ac || ac.state !== 'running') return;
  [[76, 0], [81, 0.7]].forEach(([m, delay]) => {
    const t = ac.currentTime + 0.05 + delay, o = ac.createOscillator(), g = gain(0);
    o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.connect(g);
    g.connect(verb); g.connect(gain(0.5)).connect(master);
    o.start(t); o.stop(t + 3.6);
    o.onended = () => g.disconnect();
  });
}

function setNature(v) {
  nature = v;
  if (ac) natureBus.gain.setTargetAtTime(v, ac.currentTime, 0.5);
}

// one swelling tone: sine partials plus a twin a fraction of a hertz away, for a slow beat
function tone(freq, partials, peak, t, attack, hold, release, pan) {
  const g = gain(0), panner = ac.createStereoPanner();
  panner.pan.value = pan;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + hold, release);
  g.connect(panner).connect(padBus);
  const end = t + hold + release * 6;
  partials.concat([[1, 0.6, 0.25 + Math.random() * 0.4]]).forEach(([mult, level, offset = 0], k) => {
    const o = ac.createOscillator();
    o.frequency.value = freq * mult + offset;
    o.connect(gain(level)).connect(g);
    o.start(t); o.stop(end);
    if (k === 0) o.onended = () => panner.disconnect();
  });
}

function chord(idx) {
  current = idx;
  const t = ac.currentTime + 0.1, hold = 45 + Math.random() * 30, attack = 14 + Math.random() * 6;
  CHORDS[idx].forEach((m, i) => {
    if (i > 1 && Math.random() < 0.15) return;
    const low = m < 44;
    tone(mtof(m), low ? [[1, 1], [2, 0.5], [3, 0.18]] : [[1, 1], [2, 0.28], [3, 0.1], [4, 0.04]],
      (low ? 0.07 : 0.045) * (0.8 + Math.random() * 0.4), t, attack + i * 1.5, hold, 7, (Math.random() * 2 - 1) * 0.7);
  });
  setTimeout(() => chord(pick(NEXT[idx])), (hold - attack * 0.7) * 1000);
}

// now and then a faint high voice drifts in over the chord and fades away again
function shimmer() {
  tone(mtof(pick(CHORDS[current].slice(2)) + 24), [[1, 1]], 0.012, ac.currentTime + 0.1, 9, 12, 6, Math.random() * 1.6 - 0.8);
  setTimeout(shimmer, (40 + Math.random() * 50) * 1000);
}

// a soft breath of air for a meteor; panPos −1 (left) to 1 (right), mag 0–1
function meteor(panPos, mag, fire) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime + 0.02, dur = fire ? 3.5 : 1.6;
  const src = ac.createBufferSource(), lp = filter('lowpass', 1000, 0.5), g = gain(0), pan = ac.createStereoPanner();
  src.buffer = noiseBuf; src.loop = true;
  pan.pan.value = clamp(panPos, -1, 1);
  lp.frequency.setValueAtTime(fire ? 900 : 1300, t);
  lp.frequency.exponentialRampToValueAtTime(fire ? 180 : 320, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime((fire ? 0.05 : 0.025) * mag, t + (fire ? 0.5 : 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(lp).connect(g).connect(pan);
  pan.connect(verb); pan.connect(gain(0.4)).connect(master);
  src.start(t, Math.random() * 4); src.stop(t + dur + 0.1);
  src.onended = () => pan.disconnect();
}

const targetGain = () => muted ? 0 : volume * 0.9;
function setVolume(v) {
  volume = clamp(v, 0, 1);
  if (ac) {
    const t = ac.currentTime, currentGain = master.gain.value;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(currentGain, t);
    master.gain.linearRampToValueAtTime(targetGain(), t + 0.25);
  }
}
function setMuted(value) {
  if (muted === value) return;
  muted = value; setVolume(volume);
}

return { start, meteor, chime, setVolume, setNature, setMuted };
})();
