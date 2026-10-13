// Compact bedtime controls. Existing astronomy controls keep their event handlers
// when moved into the Advanced drawer.
(() => {
'use strict';
const sky = window.KhonshuSky;
if (!sky) return;
const panel = document.getElementById('panel');
const header = document.createElement('div'); header.className = 'bedtime-header';
const title = document.createElement('div');
const name = document.createElement('strong'); name.textContent = 'KHONSHU';
const status = document.createElement('span'); status.id = 'night-status'; status.setAttribute('aria-live', 'polite');
title.append(name, status); header.append(title);
const buttons = document.createElement('div'); buttons.className = 'bedtime-actions';
for (const [id, text, action] of [['start-night', 'Start night', 'startNight'], ['wake-night', 'Wake', 'wake']]) {
  const button = document.createElement('button'); button.id = id; button.textContent = text;
  button.addEventListener('click', () => sky.actions[action]()); buttons.append(button);
}
header.append(buttons);
const basics = document.createElement('div'); basics.className = 'bedtime-basics';
for (const id of ['volume', 'brightness', 'sleep']) basics.append(document.getElementById(id).closest('label'));
const toggles = document.createElement('div'); toggles.className = 'bedtime-toggles';
for (const id of ['audio', 'sleepLock', 'autoMenu']) toggles.append(document.getElementById(id).closest('label'));
const sounds = document.getElementById('sound-library');
const readout = document.getElementById('readout');
const advanced = document.createElement('details'); advanced.id = 'advanced-controls';
const summary = document.createElement('summary'); summary.textContent = 'Advanced · sky and projector';
const grid = document.createElement('div'); grid.className = 'advanced-grid';
for (const child of [...panel.children]) if (child !== sounds && child !== readout && child.children.length) grid.append(child);
const performance = document.createElement('p'); performance.id = 'performance-readout';
grid.append(performance); advanced.append(summary, grid);
const tonight = document.createElement('details'); tonight.id = 'tonight-details';
const tonightTitle = document.createElement('summary'); tonightTitle.textContent = 'Tonight’s sky';
tonight.append(tonightTitle, readout);
const footer = document.createElement('div'); footer.className = 'bedtime-footer';
const version = document.createElement('span'); version.dataset.appVersion = '';
const online = document.createElement('span'); online.id = 'connection-status'; footer.append(version, online);
panel.replaceChildren(header, basics, toggles, sounds, advanced, tonight, footer);

function update() {
  const s = sky.settings, b = sky.bedtime;
  status.textContent = s.sleepLock ? b.sleepFade === 0 ? 'Asleep · W to wake' : 'Quiet night · Sleep lock on' : 'Ready for the night';
  document.getElementById('wake-night').hidden = !s.sleepLock && b.sleepFade === 1;
  document.getElementById('start-night').textContent = s.sleepLock ? 'Restart night' : 'Start night';
  const p = sky.performance;
  performance.textContent = `${p.fps || '—'} fps · target ${p.target} · ${['Low', 'Medium', 'High'][s.quality]} quality`;
}
window.addEventListener('khonshu-settings', update);
window.addEventListener('khonshu-status', update);
update();
})();
