const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const results = path.resolve(__dirname, '../test-results');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
let state = {}, serial = 0, commands = [], updateWorker = false;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), route = url.pathname;
    if (route === '/index.html' || route === '/remote.html') {
      res.writeHead(307, { Location: route === '/index.html' ? '/' : '/remote' }).end();return;
    }
    if (route.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      let body='';for await(const chunk of req) body+=chunk;
      if (route==='/api/state' && req.method==='POST') { state=JSON.parse(body);res.end('{"ok":true}'); }
      else if(route==='/api/command') { commands.push({id:++serial,command:JSON.parse(body)});res.end('{"ok":true}'); }
      else if(route==='/api/poll') {const since=+url.searchParams.get('since');res.end(JSON.stringify({latest:serial,commands:since<0?[]:commands.filter(c=>c.id>since).map(c=>c.command)}));}
      else res.end(JSON.stringify(state));
      return;
    }
    const name = route==='/' ? 'index.html' : route==='/remote' ? 'remote.html' : decodeURIComponent(route.slice(1));
    const file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep)) {res.writeHead(404).end();return;}
    let data=await fs.readFile(file);
    if(name==='sw.js' && updateWorker) data=Buffer.from(data.toString().replace(/const VERSION = "[^"]+";/,'const VERSION = "test-update";'));
    res.setHeader('Content-Type',mime[path.extname(name)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
  } catch {res.writeHead(404).end();}
});
function wav() {
  const rate=22050,count=rate,buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);
  buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
  buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)buffer.writeInt16LE(Math.round(Math.sin(i/rate*Math.PI*2*110)*1200),44+i*2);
  return buffer;
}
(async()=>{
  await fs.mkdir(results,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.KHONSHU_BROWSER_CHANNEL?{channel:process.env.KHONSHU_BROWSER_CHANNEL}:{})});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    await context.route(/celestrak|noaa|open-meteo/,r=>r.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      if(!localStorage.getItem('khonshu-settings-v5'))localStorage.setItem('khonshu-settings-v5',JSON.stringify({audio:false,online:false,autoMenu:false,daylight:false,nature:0,quality:0,clouds:0,aurora:0,realMeteors:false,meteors:0}));
      const realNow=Date.now.bind(Date);window.testOffset=0;Date.now=()=>realNow()+window.testOffset;
      window.testGains=[];const Native=window.AudioContext;
      window.AudioContext=class extends Native{constructor(...args){super(...args);window.testAudio=this;}createGain(){const g=super.createGain();window.testGains.push(g);return g;}};
    });
    await page.goto(base);await page.locator('#begin').click();await page.evaluate(()=>document.fullscreenElement&&document.exitFullscreen());
    assert(await page.locator('#volume').isVisible());assert.equal(await page.locator('#city').isVisible(),false);
    await page.locator('#sound-library summary').click();await page.locator('#sound-source').selectOption('deep-space');
    assert.equal(await page.evaluate(()=>KhonshuSky.settings.droneMix),90);
    await page.locator('#audio').check();await page.waitForTimeout(1000);
    assert(Math.abs(await page.evaluate(()=>testGains[0].gain.value)-0.54)<0.01);
    await page.locator('#padsMix').fill('0');await page.locator('#padsMix').dispatchEvent('input');await page.waitForTimeout(900);
    assert.equal(await page.evaluate(()=>testGains[3].gain.value),0,'Pads mixer must reach actual zero gain');
    await page.locator('#audio-files').waitFor();await page.waitForFunction(()=>!document.getElementById('audio-files').disabled);
    await page.locator('#audio-files').setInputFiles({name:'sleep.wav',mimeType:'audio/wav',buffer:wav()});
    await page.waitForFunction(()=>KhonshuSky.settings.soundSource.startsWith('local:'));
    if(!await page.evaluate(()=>SkyAudio.playback.playing))await page.locator('#play-track').click();
    await page.waitForFunction(()=>SkyAudio.playback.playing);
    await page.locator('#audio').uncheck();await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>testGains[0].gain.value),0);assert.equal(await page.evaluate(()=>SkyAudio.playback.playing),false);
    await page.reload();await page.locator('#begin').click();await page.evaluate(()=>document.fullscreenElement&&document.exitFullscreen());
    await page.locator('#sound-library summary').click();await page.waitForFunction(()=>window.KHONSHU_TRACKS?.length===1);
    assert.match(await page.locator('#sound-source option:checked').textContent(),/sleep.wav/);
    await page.locator('#audio').check();await page.waitForFunction(()=>SkyAudio.playback.playing);
    // An active voyage and tour must stop when entering Sleep lock.
    await page.evaluate(()=>{KhonshuSky.voyage.hold('saturn',0.5);KhonshuSky.actions.tour();});
    await page.locator('#start-night').click();assert(await page.evaluate(()=>KhonshuSky.settings.sleepLock));
    assert.equal(await page.evaluate(()=>KhonshuSky.fx.lift),0);
    await page.evaluate(()=>{KhonshuSky.setSleepTimer(15);window.testOffset+=16*60000;});
    await page.waitForFunction(()=>KhonshuSky.bedtime.sleepFade===0);await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>testGains[0].gain.value),0);
    await page.waitForFunction(()=>testAudio.state==='suspended');
    assert.equal(await page.evaluate(()=>SkyAudio.playback.playing),false,'Fully asleep must stop local playback');
    const timer=await page.evaluate(()=>KhonshuSky.bedtime.sleepAt);await page.mouse.move(300,700);await page.mouse.move(600,800);
    assert.equal(await page.evaluate(()=>KhonshuSky.bedtime.sleepAt),timer);assert.equal(await page.evaluate(()=>KhonshuSky.bedtime.sleepFade),0);
    await page.evaluate(()=>{const before=testGains.length;SkyAudio.chime();if(testGains.length!==before)throw new Error('Quiet mode emitted an alert');});
    await page.keyboard.press('h');assert(await page.locator('#wake-night').isVisible());
    await page.keyboard.press('w');assert.equal(await page.evaluate(()=>KhonshuSky.settings.sleepLock),false);
    await page.waitForFunction(()=>testAudio.state==='running');
    // A scheduled dawn must also resume a fully suspended night automatically.
    await page.evaluate(()=>{KhonshuSky.change('sleepLock',true);KhonshuSky.setSleepTimer(15);window.testOffset+=16*60000;});
    await page.waitForFunction(()=>testAudio.state==='suspended');
    await page.evaluate(()=>{const at=new Date(Date.now()-window.testOffset+60000);KhonshuSky.change('alarm',String(at.getHours()).padStart(2,'0')+':'+String(at.getMinutes()).padStart(2,'0'));});
    await page.waitForFunction(()=>!KhonshuSky.settings.sleepLock&&testAudio.state==='running'&&KhonshuSky.bedtime.sleepFade>0);
    await page.waitForFunction(()=>SkyAudio.playback.playing);
    await page.evaluate(()=>{KhonshuSky.change('alarm','');KhonshuSky.actions.wake();});
    await page.evaluate(()=>{window.testOffset=0;KhonshuSky.change('autoMenu',false);});
    const beforeFrames=await page.evaluate(()=>KhonshuSky.performance.frames);await page.waitForTimeout(1000);
    const frames=await page.evaluate(()=>KhonshuSky.performance.frames)-beforeFrames;
    assert(frames>5&&frames<=35,'Default renderer should obey its 30 fps budget');
    await page.locator('#advanced-controls summary').click();await page.locator('#fps').selectOption('60');
    assert.equal(await page.evaluate(()=>KhonshuSky.performance.target),60);
    await page.locator('#advanced-controls summary').click();
    const remote=await context.newPage();remote.on('pageerror',e=>errors.push(e.message));await remote.goto(base+'/remote');
    await remote.waitForFunction(()=>document.querySelector('#sound-source option[value^="local:"]'));
    await remote.locator('#sound-source').selectOption('weightless');await page.waitForFunction(()=>KhonshuSky.settings.soundSource==='weightless');
    await remote.locator('[data-key=sleepLock]').check();await page.waitForFunction(()=>KhonshuSky.settings.sleepLock);
    await remote.locator('[data-action=wake]').click();await page.waitForFunction(()=>!KhonshuSky.settings.sleepLock);
    // Every required asset is saved, and /api/ is deliberately not intercepted.
    await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    const cached=await page.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.map(async k=>(await caches.open(k)).keys()))).flat().map(r=>r.url);});
    assert(!cached.some(url=>url.includes('/api/')));assert(cached.some(url=>url.endsWith('js/sky.js')));
    await context.setOffline(true);await page.reload();await page.locator('#begin').click();await page.evaluate(()=>document.fullscreenElement&&document.exitFullscreen());
    assert(await page.locator('#start-night').isVisible());await page.waitForFunction(()=>window.KHONSHU_TRACKS?.length===1);
    await page.locator('#sound-library summary').click();await page.locator('#sound-source').selectOption('quiet-hush');
    assert.equal(await page.evaluate(()=>KhonshuSky.settings.padsMix),0);
    await context.setOffline(false);await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.getElementById('panel').scrollWidth>document.getElementById('panel').clientWidth+1),false);
    await page.screenshot({path:path.join(results,'bedtime-mobile.png')});
    await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(results,'bedtime-desktop.png')});
    // Updates wait for an explicit action and cannot interrupt a locked night.
    updateWorker=true;await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
    await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
    await page.evaluate(()=>KhonshuSky.change('sleepLock',true));assert.equal(await page.locator('#app-update').isEnabled(),false);
    await page.keyboard.press('w');assert(await page.locator('#app-update').isEnabled());
    await page.locator('#app-update').click();await page.waitForLoadState();
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: audio mixer/file persistence/mute/fade, Sleep lock, remote sync, offline reload, responsive menus and safe updates');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
