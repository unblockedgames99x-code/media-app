import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connect, delay, freePort } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa');
fs.mkdirSync(output, { recursive: true });
const profile = 'qa-' + Date.now();
const migration = JSON.parse(execFileSync('python', [path.join(root, '_scripts/migrate-profile.py'), '--profile', profile], { encoding: 'utf8' }));
const report = { startedAt: new Date().toISOString(), migration, musicRoutes: [], videoRoutes: [] };
const hostPort = await freePort();
const videoPort = await freePort();
const executable = process.env.CARTERMEDIA_EXE || path.join(root, 'build/Media-1.50.0-windows-x64-portable/Media.exe');
let host, video, processHandle, enginePid;
let logs = '';

const clickText = async (client, text) => {
  const expression = `[...document.getElementsByTagName('*')].find(element=>(['BUTTON','A'].includes(element.tagName)||['button','tab'].includes(element.getAttribute('role')))&&element.textContent.trim()===${JSON.stringify(text)})`;
  await client.until(`Boolean(${expression})`, 10000);
  return client.evaluate(`(${expression}).click()`);
};
const screenshot = async (client, name) => {
  fs.writeFileSync(path.join(output, name), Buffer.from((await client.send('Page.captureScreenshot', { fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true })).data, 'base64'));
};

try {
  processHandle = spawn(executable, ['--profile', profile], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${hostPort} --remote-debugging-address=127.0.0.1`, CARTERMEDIA_VIDEO_DEBUG_PORT: String(videoPort) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stderr.on('data', data => { logs += data.toString(); });
  processHandle.stdout.on('data', data => { logs += data.toString(); });
  processHandle.on('error', error => { report.launchError = error.message; });
  host = await connect(hostPort, item => item.type === 'page' && /tauri\.localhost|tauri:/.test(item.url));
  await host.evaluate("globalThis.qaClicks=[];document.addEventListener('click',event=>qaClicks.push({trusted:event.isTrusted,tag:event.target.tagName,text:event.target.textContent?.slice(0,70),path:location.pathname}),true)");
  await host.until("qa.role('dialog')?.textContent.includes('Your media, your way')");
  await screenshot(host, 'media-setup.png');
  await clickText(host, 'Continue');
  await clickText(host, 'Ocean');
  await clickText(host, 'Continue');
  await host.evaluate(`(()=>{const label=[...document.getElementsByTagName('label')].find(element=>element.textContent.trim()==='Your app name');const input=document.getElementById(label.htmlFor);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'QA Studio');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await clickText(host, 'Continue');
  await host.evaluate(`(()=>{const label=[...document.getElementsByTagName('label')].find(element=>element.textContent.trim()==='Font style');const input=document.getElementById(label.htmlFor);input.value='mono';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await clickText(host, 'Start listening');
  await host.until("!qa.role('dialog')&&document.title==='QA Studio'");
  report.setup = await host.evaluate("({title:document.title,font:getComputedStyle(document.body).fontFamily,accent:getComputedStyle(document.documentElement).getPropertyValue('--primary'),identity:qa.testId('personal-identity')?.textContent})");
  assert(report.setup.font.includes('Space Mono'));
  assert.equal(report.setup.accent.trim(), '#67d9d0');
  await host.until("Boolean(qa.testId('search-box'))");
  await delay(5000);
  report.brand = await host.evaluate("({title:document.title,theme:document.documentElement.getAttribute('data-theme'),primary:getComputedStyle(document.documentElement).getPropertyValue('--primary'),text:document.body.innerText.slice(0,500)})");
  assert.equal(report.brand.title, 'QA Studio');
  assert(!report.brand.text.includes('CarterMedia')); 
  report.musicMediaSwitch = await host.evaluate("[...qa.tag('nav').getElementsByTagName('a')].map(element=>({label:element.textContent.trim(),current:element.getAttribute('aria-current')}))");
  assert(report.musicMediaSwitch.some(link => link.label === 'Music' && link.current === 'page'));
  assert(report.musicMediaSwitch.some(link => link.label === 'Videos'));
  await screenshot(host, 'cartermedia-music.png');
  for (const route of ['/favorites/albums', '/favorites/tracks', '/favorites/artists', '/playlists', '/history', '/lyrics', '/sources', '/dashboard']) {
    await host.evaluate(`qa.link(${JSON.stringify(route)}).click()`);
    await delay(450);
    report.musicRoutes.push(await host.evaluate("({path:location.pathname,text:qa.tag('main')?.innerText?.slice(0,220)||document.body.innerText.slice(-220),overflow:document.documentElement.scrollWidth>innerWidth})"));
  }
  await clickText(host, 'Preferences');
  await host.until("Boolean(qa.role('dialog'))");
  await host.evaluate("[...qa.testId('settings-navigation-section-app').getElementsByTagName('button')].find(element=>element.textContent.trim()==='Plugins').click()");
  await host.until("qa.withPrefix('data-testid','toggle-enable-plugin-').length>=5");
  report.plugins = await host.evaluate("qa.withPrefix('data-testid','toggle-enable-plugin-').map(element=>({id:element.dataset.testid,enabled:element.dataset.enabled}))");
  assert(report.plugins.every(plugin => plugin.enabled === 'true'));
  await screenshot(host, 'cartermedia-plugins.png');
  await clickText(host, 'Store');
  await delay(2500);
  report.pluginStore = await host.evaluate("({text:qa.role('dialog').innerText.slice(0,1200)})");
  await host.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await host.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await host.until("!qa.role('dialog')");
  if (await host.evaluate("Boolean(qa.testId('now-playing-title')?.textContent.trim())")) {
    await host.evaluate("qa.testId('player-play-button')?.click()");
    await host.until("qa.tag('audio')&&!qa.tag('audio').paused&&qa.tag('audio').readyState>=2", 45000);
    report.musicStart = await host.evaluate("({time:qa.tag('audio').currentTime,paused:qa.tag('audio').paused})");
    await delay(6000);
    report.musicEnd = await host.evaluate("({time:qa.tag('audio').currentTime,paused:qa.tag('audio').paused,path:location.pathname,clicks:qaClicks.slice(-8)})");
    assert(report.musicEnd.time > report.musicStart.time + 3, 'Music playback did not advance');
  }
  await host.evaluate("qa.link('/videos').click()");
  await host.until("window.__TAURI_INTERNALS__.invoke('video_engine_status').then(state=>state.ready&&state.visible)", 35000);
  report.embedding = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
  enginePid = report.embedding.pid;
  assert.equal(report.embedding.ready, true);
  assert.equal(report.embedding.visible, true);
  assert(report.embedding.parentHwnd && report.embedding.parentHwnd !== '0');
  video = await connect(videoPort, item => item.type === 'page' && item.url.startsWith('app:'));
  await video.until("Boolean(qa.role('main'))");
  report.videoStyles = await video.evaluate("[...document.getElementsByTagName('link')].filter(element=>element.rel==='stylesheet').map(element=>({href:element.href,loaded:Boolean(element.sheet)}))");
  assert(report.videoStyles.length > 0 && report.videoStyles.every(stylesheet => stylesheet.loaded), 'Packaged video styles did not load');
  await delay(6000);
  report.videoHome = await video.evaluate("({title:document.title,cards:qa.byClass('ft-list-video').length,font:getComputedStyle(qa.byClass('app')[0]).fontFamily,sideNavVisible:qa.byClass('sideNav')[0]?getComputedStyle(qa.byClass('sideNav')[0]).display:null,primary:getComputedStyle(document.documentElement).getPropertyValue('--primary'),width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth})");
  assert(!report.videoHome.title.includes('Carter'));
  await video.until("[...qa.byClass('personalName')].some(element=>element.textContent==='QA Studio')");
  report.videoPersonalization = await video.evaluate("({name:qa.byClass('personalName')[0]?.textContent,font:getComputedStyle(qa.byClass('app')[0]).fontFamily,accent:getComputedStyle(document.documentElement).getPropertyValue('--cm-primary')})");
  assert.equal(report.videoPersonalization.name, 'QA Studio');
  assert.equal(report.videoPersonalization.accent.trim(), '#67d9d0');
  assert(report.videoHome.cards > 0);
  assert.equal(report.videoHome.overflow, false);
  await video.evaluate("globalThis.qaFrames=0;globalThis.qaCounting=true;function tick(){qaFrames++;if(qaCounting)requestAnimationFrame(tick)};requestAnimationFrame(tick)");
  await delay(2000);
  report.animationFrames = await video.evaluate("globalThis.qaCounting=false;qaFrames");
  assert(report.animationFrames > 20, 'Visible video engine animations are not advancing');
  await screenshot(video, 'cartermedia-videos.png');
  const watchRoute = await video.evaluate("qa.linksContaining('/watch/')[0]?.getAttribute('href')");
  for (const route of ['/subscriptions', '/trending', '/popular', '/userplaylists', '/history', '/subscribedchannels', '/settings', '/about', '/home']) {
    await host.evaluate(`window.__TAURI_INTERNALS__.invoke('video_engine_navigate',{path:${JSON.stringify(route)}})`);
    await delay(600);
    report.videoRoutes.push(await video.evaluate("({path:location.hash,title:document.title,text:qa.role('main')?.innerText.slice(0,180),overflow:document.documentElement.scrollWidth>innerWidth})"));
  }
  await clickText(host, 'Preferences');
  await host.until("Boolean(qa.role('dialog'))");
  await delay(300);
  report.settingsOverlay = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
  assert.equal(report.settingsOverlay.visible, false);
  await host.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await host.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await host.until("window.__TAURI_INTERNALS__.invoke('video_engine_status').then(state=>state.visible)");
  if (watchRoute) {
    await video.evaluate(`location.hash=${JSON.stringify(watchRoute.slice(watchRoute.indexOf('#') + 1))}`);
    await video.until("qa.tag('video')?.readyState>=2", 45000);
    await video.evaluate("qa.tag('video').play()");
    report.videoStart = await video.evaluate("({time:qa.tag('video').currentTime,paused:qa.tag('video').paused,frames:qa.tag('video').getVideoPlaybackQuality().totalVideoFrames})");
    await delay(8000);
    report.videoEnd = await video.evaluate("({time:qa.tag('video').currentTime,paused:qa.tag('video').paused,frames:qa.tag('video').getVideoPlaybackQuality().totalVideoFrames,controls:qa.byClass('shaka-controls-container')[0]?.getElementsByTagName('button').length})");
    assert(report.videoEnd.time > report.videoStart.time + 3, 'Video playback did not advance');
    assert.equal(report.videoEnd.paused, false, 'Visible video paused unexpectedly');
    assert(report.videoEnd.frames > report.videoStart.frames + 30, 'Video frames are not being rendered');
    await screenshot(video, 'cartermedia-watch.png');
    const fullscreenButton = await video.evaluate("(()=>{const rect=qa.byClass('shaka-fullscreen-button')[0].getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()");
    await video.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...fullscreenButton });
    await delay(300);
    await video.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...fullscreenButton, button: 'left', clickCount: 1 });
    await video.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...fullscreenButton, button: 'left', clickCount: 1 });
    await host.until("window.__TAURI_INTERNALS__.invoke('video_engine_status').then(state=>state.fullscreen)");
    await delay(500);
    report.fullscreen = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
    assert.equal(report.fullscreen.requestedBounds.x, 0);
    assert.equal(report.fullscreen.requestedBounds.y, 0);
    await video.evaluate("document.exitFullscreen()");
    await host.until("window.__TAURI_INTERNALS__.invoke('video_engine_status').then(state=>!state.fullscreen)");
  }
  await host.evaluate("qa.link('/dashboard').click()");
  await delay(700);
  report.returnToMusic = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
  assert.equal(report.returnToMusic.visible, false);
  report.returnedMediaSwitch = await host.evaluate("[...qa.tag('nav').getElementsByTagName('a')].map(element=>({label:element.textContent.trim(),current:element.getAttribute('aria-current')}))");
  assert(report.returnedMediaSwitch.some(link => link.label === 'Music' && link.current === 'page'));
  report.hiddenPlayback = await video.evaluate("({paused:qa.tag('video')?.paused,time:qa.tag('video')?.currentTime})");
  if (watchRoute) assert.equal(report.hiddenPlayback.paused, true);
  await host.evaluate("qa.link('/videos').click()");
  await host.until("window.__TAURI_INTERNALS__.invoke('video_engine_status').then(state=>state.visible)");
  report.returnToVideo = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
  assert.equal(report.returnToVideo.pid, enginePid, 'Switching sections should reuse the video engine');
  const linkedVideoId = watchRoute?.match(/\/watch\/([A-Za-z0-9_-]{11})/)?.[1];
  if (linkedVideoId) {
    await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_navigate',{path:'/home'})");
    await video.until("location.hash==='#/home'");
    const linkProcess = spawn(executable, ['--profile', profile, `cartermedia://watch/${linkedVideoId}`], { windowsHide: true, stdio: 'ignore' });
    const linkDeadline = Date.now() + 10000;
    while (linkProcess.exitCode === null && Date.now() < linkDeadline) await delay(100);
    assert.equal(linkProcess.exitCode, 0, 'Video link should reuse the existing app');
    await video.until(`location.hash==='#/watch/${linkedVideoId}'`);
    report.deepLink = await video.evaluate("({path:location.hash,title:document.title})");
  }
  if (process.env.CARTERMEDIA_FAULT_QA) {
    void video.send('Runtime.evaluate', { expression: 'for (;;) {}' }).catch(() => {});
    await host.until("qa.role('alert')?.textContent.includes('Videos could not open')", 30000);
    report.hangRecovery = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
    assert.equal(report.hangRecovery.ready, false);
    video.close();
    await clickText(host, 'Try again');
    await host.until("window.__TAURI_INTERNALS__.invoke('video_engine_status').then(state=>state.ready&&state.visible)");
    const replacement = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
    assert.notEqual(replacement.pid, enginePid, 'Retry must replace the frozen engine');
    enginePid = replacement.pid;
    video = await connect(videoPort, item => item.type === 'page' && item.url.startsWith('app:'));
    report.recoveredEngine = replacement;
  }
  report.hostExceptions = host.exceptions;
  report.videoExceptions = video.exceptions;
  report.hostErrors = host.errors;
  report.videoErrors = video.errors;
  assert.equal(host.exceptions.length + video.exceptions.length, 0, 'Uncaught application error');
  video.close();
  await host.send('Runtime.evaluate', { expression: "void window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})" }).catch(() => {});
  host.close();
  const closeDeadline = Date.now() + 15000;
  while (processHandle.exitCode === null && Date.now() < closeDeadline) await delay(100);
  assert.notEqual(processHandle.exitCode, null, 'The app did not close cleanly');
  await delay(1500);
  try { process.kill(enginePid, 0); report.engineExitedBeforeReopen = false; } catch { report.engineExitedBeforeReopen = true; }
  assert.equal(report.engineExitedBeforeReopen, true, 'Video engine remained after closing the app');
  enginePid = undefined;
  processHandle = spawn(executable, ['--profile', profile], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${hostPort} --remote-debugging-address=127.0.0.1`, CARTERMEDIA_VIDEO_DEBUG_PORT: String(videoPort) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stderr.on('data', data => { logs += data.toString(); });
  processHandle.stdout.on('data', data => { logs += data.toString(); });
  host = await connect(hostPort, item => item.type === 'page' && /tauri\.localhost|tauri:/.test(item.url));
  await host.until("document.title==='QA Studio'&&Boolean(qa.testId('search-box'))");
  await delay(1000);
  report.restoredPersonalization = await host.evaluate("({title:document.title,font:getComputedStyle(document.body).fontFamily,accent:getComputedStyle(document.documentElement).getPropertyValue('--primary'),setupVisible:qa.role('dialog')?.textContent.includes('Your media, your way')||false})");
  assert.equal(report.restoredPersonalization.setupVisible, false);
  assert.equal(report.restoredPersonalization.title, 'QA Studio');
  assert(report.restoredPersonalization.font.includes('Space Mono'));
  assert.equal(report.restoredPersonalization.accent.trim(), '#67d9d0');
  await screenshot(host, 'media-personalized-reopened.png');
  report.passed = true;
  report.logs = logs.slice(-1500);
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  if (host) report.hostState = await host.evaluate("({url:location.href,text:document.body.innerText.slice(0,2200)})").catch(() => null);
  if (host) report.nativeState = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')").catch(() => null);
  if (host) report.invokeFailures = await host.evaluate("globalThis.qaInvokeFailures").catch(() => null);
  if (video) report.videoState = await video.evaluate("({path:location.hash,fullscreen:document.fullscreenElement?.className,active:document.activeElement?.className,buttons:qa.byClass('shaka-fullscreen-button').map(element=>({text:element.innerText,label:element.getAttribute('aria-label'),disabled:element.disabled,rect:{x:element.getBoundingClientRect().x,y:element.getBoundingClientRect().y,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height}}))})").catch(() => null);
  report.hostErrors = host?.errors;
  report.videoErrors = video?.errors;
  process.exitCode = 1;
} finally {
  report.logs = logs.slice(-6000);
  video?.close();
  if (host && report.passed) {
    await host.send('Runtime.evaluate', { expression: "void window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})" }).catch(() => {});
    await delay(1200);
  }
  host?.close();
  if (processHandle?.exitCode === null) processHandle.kill();
  await delay(2000);
  if (enginePid) {
    try { process.kill(enginePid, 0); report.engineExitedWithHost = false; } catch { report.engineExitedWithHost = true; }
  }
  fs.writeFileSync(path.join(output, 'smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
