(() => {
'use strict';
const build = window.KHONSHU_BUILD || { version: 'dev', commit: 'local' };
for (const el of document.querySelectorAll('[data-app-version]')) {
  el.textContent = `${build.version} · ${build.commit}`;
  el.title = build.builtAt ? 'Built ' + new Date(build.builtAt).toLocaleString() : 'Local source preview';
}
const status = document.getElementById('connection-status');
let offlineReady = false, registration = null, deferredInstall = null, requestReload = false;
function showConnection() {
  if (status) status.textContent = navigator.onLine ? offlineReady ? 'Saved for offline use' : 'Online' : offlineReady ? 'Offline · sky and sounds ready' : 'Offline';
}
window.addEventListener('online', showConnection); window.addEventListener('offline', showConnection);
showConnection();
const footer = document.querySelector('.bedtime-footer');
const update = document.createElement('button'); update.id = 'app-update'; update.hidden = true;
update.textContent = 'Update ready'; update.title = 'Reload with the newest saved release';
const install = document.createElement('button'); install.id = 'install-app'; install.hidden = true; install.textContent = 'Install app';
footer?.append(install, update);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; install.hidden = false; });
install.addEventListener('click', async () => {
  if (!deferredInstall) return;
  await deferredInstall.prompt(); await deferredInstall.userChoice;
  deferredInstall = null; install.hidden = true;
});
window.addEventListener('appinstalled', () => { install.hidden = true; deferredInstall = null; });
function updateState() {
  update.disabled = !!window.KhonshuSky?.settings.sleepLock;
  update.title = update.disabled ? 'Wake before applying the update' : 'Reload with the newest saved release';
}
window.addEventListener('khonshu-settings', updateState);
update.addEventListener('click', () => {
  if (!registration?.waiting || window.KhonshuSky?.settings.sleepLock) return;
  requestReload = true; registration.waiting.postMessage({ type: 'APPLY_UPDATE' });
});
// Source files opened directly already work offline. Only built deployments
// register a worker, preventing stale caches while developing the source folder.
if (!('serviceWorker' in navigator) || !window.isSecureContext || build.commit === 'local') return;
navigator.serviceWorker.addEventListener('controllerchange', () => { if (requestReload) location.reload(); });
navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(async reg => {
  registration = reg;
  function pending() { update.hidden = !reg.waiting; updateState(); }
  pending();
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') pending(); });
  });
  await navigator.serviceWorker.ready; offlineReady = true; showConnection();
}).catch(() => { if (status) status.textContent = 'Offline save unavailable'; });
})();
