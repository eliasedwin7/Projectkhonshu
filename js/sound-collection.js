// Native soundscapes and private local tracks share Khonshu's audio bus.
(() => {
'use strict';
const sky = window.KhonshuSky;
const presets = [
  { id: 'khonshu', name: 'Khonshu ambient', mix: [70, 70, 35], note: 'Slow, warm chords over a deep drone. Works offline.' },
  { id: 'deep-space', name: 'Deep space', mix: [90, 25, 45], note: 'A deep drone, distant pads and a faint space-like hush.' },
  { id: 'weightless', name: 'Weightless', mix: [35, 85, 20], note: 'Soft musical pads with very little background noise.' },
  { id: 'quiet-hush', name: 'Quiet hush', mix: [20, 0, 70], note: 'A steady, low wash of air with a trace of bass.' },
];
const external = [
  { id: 'black-hole', name: 'myNoise · Black Hole', note: 'Try Serenity or Floating.', url: 'https://mynoise.net/NoiseMachines/intergalacticSoundscapeGenerator.php' },
  { id: 'drone-zone', name: 'SomaFM · Drone Zone', note: 'Atmospheric drones and space music with minimal beats.', url: 'https://somafm.com/dronezone/' },
  { id: 'deep-space-one', name: 'SomaFM · Deep Space One', note: 'Deep ambient electronic and space music.', url: 'https://somafm.com/deepspaceone/' },
];
const container = document.querySelector('[data-sound-collection]');
if (!container) return;
let tracks = [], settings = sky?.settings || {}, externalChoice = null, loadedSource = null, database = null, remotePlayback = null;
const label = document.createElement('label'); label.textContent = 'Sound';
const select = document.createElement('select'); select.id = 'sound-source'; label.htmlFor = select.id; label.append(select);
const description = document.createElement('p'); description.className = 'sound-description'; description.id = 'sound-description';
select.setAttribute('aria-describedby', description.id);
const link = document.createElement('a'); link.className = 'sound-player'; link.target = '_blank'; link.rel = 'noopener noreferrer';
const note = document.createElement('p'); note.className = 'sound-note';
note.textContent = 'External players use their own volume and timer. For Khonshu’s sleep timer, choose a built-in sound or add your own audio file.';
const controls = document.createElement('div'); controls.className = 'sound-controls';
const play = document.createElement('button'); play.type = 'button'; play.id = 'play-track'; play.textContent = 'Play';
const fileLabel = document.createElement('label'); fileLabel.textContent = 'Add your tracks';
const input = document.createElement('input'); input.id = 'audio-files'; input.type = 'file'; input.accept = 'audio/*'; input.multiple = true;
fileLabel.append(input); fileLabel.hidden = !sky; input.disabled = !!sky;
const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove track'; remove.hidden = true;
controls.append(play, fileLabel, remove);
const feedback = document.createElement('p'); feedback.className = 'sound-note'; feedback.id = 'audio-feedback'; feedback.setAttribute('role', 'status');
const mixer = document.createElement('div'); mixer.className = 'sound-mixer';
const sliders = {};
for (const [key, text] of [['droneMix', 'Drone'], ['padsMix', 'Pads'], ['airMix', 'Air']]) {
  const row = document.createElement('label'), title = document.createElement('span'), out = document.createElement('output');
  title.textContent = text; out.id = 'o-' + key; title.append(out);
  const range = document.createElement('input'); range.id = key; range.type = 'range'; range.min = 0; range.max = 100; range.step = 1;
  row.append(title, range); mixer.append(row); sliders[key] = { range, out };
  range.addEventListener('input', () => { out.textContent = range.value + '%'; request({ set: { [key]: +range.value } }); });
}
container.replaceChildren(label, description, mixer, controls, link, note, feedback);
function request(command) {
  if (sky) {
    if (command.set) for (const [key, value] of Object.entries(command.set)) sky.change(key, value);
    if (command.action) sky.actions[command.action]?.();
  } else window.dispatchEvent(new CustomEvent('khonshu-command', { detail: command }));
}
function options() {
  select.replaceChildren();
  for (const [title, list] of [['Built-in · offline', presets], ['Your tracks · this device', tracks.map(t => ({ id: 'local:' + t.id, name: t.name }))], ['External players', external]]) {
    if (!list.length) continue;
    const group = document.createElement('optgroup'); group.label = title;
    for (const item of list) group.append(new Option(item.name, item.id));
    select.append(group);
  }
  if (settings.soundSource?.startsWith('local:') && !tracks.some(t => 'local:' + t.id === settings.soundSource)) select.add(new Option('Saved track unavailable on this device', settings.soundSource));
}
function render() {
  const id = externalChoice || settings.soundSource || 'khonshu'; select.value = id;
  const service = external.find(s => s.id === id), preset = presets.find(p => p.id === id), local = id.startsWith('local:');
  description.textContent = service?.note || preset?.note || 'Your track loops inside Khonshu. Volume, mute and the sleep timer apply.';
  link.hidden = note.hidden = !service; mixer.hidden = !!service || local; play.hidden = !local; remove.hidden = !sky || !local;
  if (service) { link.href = service.url; link.textContent = 'Open player and mute Khonshu ↗'; } else link.removeAttribute('href');
  for (const [key, { range, out }] of Object.entries(sliders)) {
    if (document.activeElement !== range) range.value = settings[key] ?? 0;
    out.textContent = range.value + '%';
  }
  play.textContent = (sky ? sky.audio.playback.playing : remotePlayback?.playing) ? 'Pause' : 'Play';
}
function activateSource() {
  if (!sky || loadedSource === settings.soundSource) return;
  const id = settings.soundSource || 'khonshu';
  if (id.startsWith('local:')) {
    const track = tracks.find(t => 'local:' + t.id === id);
    if (!track) { sky.audio.setSource('local'); return; }
    sky.audio.setFile(track.blob); sky.audio.setSource('local');
  } else sky.audio.setSource('generated');
  loadedSource = id;
}
select.addEventListener('change', () => {
  externalChoice = external.some(s => s.id === select.value) ? select.value : null;
  if (externalChoice) { render(); return; }
  const preset = presets.find(p => p.id === select.value), set = { soundSource: select.value };
  if (preset) [set.droneMix, set.padsMix, set.airMix] = preset.mix;
  request({ set });
});
link.addEventListener('click', () => request({ set: { audio: false } }));
play.addEventListener('click', () => request({ action: 'playTrack' }));
if (sky) {
  sky.actions.playTrack = () => { if (!sky.settings.audio) sky.change('audio', true); else sky.audio.togglePlayback(); };
  window.addEventListener('khonshu-settings', e => { settings = e.detail; activateSource(); render(); });
  window.addEventListener('khonshu-playback', e => { if (e.detail.message) feedback.textContent = e.detail.message; render(); });
  window.addEventListener('khonshu-status', render);
} else window.addEventListener('khonshu-remote-state', e => { settings = e.detail.settings || settings; tracks = e.detail.tracks || []; remotePlayback = e.detail.playback; options(); render(); });
async function openDatabase() {
  if (!window.indexedDB) return null;
  return new Promise(resolve => {
    let settled = false; const finish = db => { if (!settled) { settled = true; resolve(db); } };
    const open = indexedDB.open('khonshu-audio', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('tracks', { keyPath: 'id' });
    open.onsuccess = () => { if (settled) open.result.close(); else finish(open.result); };
    open.onerror = open.onblocked = () => finish(null); setTimeout(() => finish(null), 3000);
  });
}
function transaction(method, value) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction('tracks', method === 'getAll' ? 'readonly' : 'readwrite');
    const operation = tx.objectStore('tracks')[method](value); let result;
    operation.onsuccess = () => { result = operation.result; }; tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage unavailable'));
  });
}
function publishTracks() {
  window.KHONSHU_TRACKS = tracks.map(({ id, name }) => ({ id, name }));
  options(); activateSource(); render(); if (sky) sky.change('soundSource', sky.settings.soundSource);
}
input.addEventListener('change', async () => {
  feedback.textContent = 'Adding tracks…'; let first = null;
  for (const file of input.files) {
    if ((!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(file.name)) || file.size > 200 * 1024 * 1024) { feedback.textContent = 'Choose an audio file smaller than 200 MB.'; continue; }
    const track = { id: crypto.randomUUID(), name: file.name, blob: file };
    try { if (database) await transaction('put', track); tracks.push(track); first ||= track; }
    catch { feedback.textContent = 'Device storage is full or unavailable. The file was not added.'; }
  }
  publishTracks(); input.value = '';
  if (first) { externalChoice = null; request({ set: { soundSource: 'local:' + first.id } }); feedback.textContent = database ? 'Saved on this device. Your files are never uploaded.' : 'Available for this session. Device storage is unavailable.'; }
});
remove.addEventListener('click', async () => {
  const id = settings.soundSource.slice(6);
  try {
    if (database) await transaction('delete', id); tracks = tracks.filter(t => t.id !== id); sky.audio.setFile(null);
    request({ set: { soundSource: 'khonshu' } }); publishTracks(); feedback.textContent = 'Removed from Khonshu. The original file is unchanged.';
  } catch { feedback.textContent = 'Could not remove that track. Try again.'; }
});
options(); render();
if (sky) (async () => {
  database = await openDatabase(); try { if (database) tracks = await transaction('getAll'); } catch { database = null; }
  if (settings.soundSource.startsWith('local:') && !tracks.some(t => 'local:' + t.id === settings.soundSource)) { sky.change('audio', false); sky.change('soundSource', 'khonshu'); feedback.textContent = 'Your saved track is unavailable. Add it again or choose a built-in sound.'; }
  publishTracks(); input.disabled = false;
})();
})();
