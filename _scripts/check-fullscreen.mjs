import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, delay, freePort } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = 'fullscreen-' + Date.now();
execFileSync('python', [path.join(root, '_scripts/migrate-profile.py'), '--profile', profile]);
const hostPort = await freePort();
const videoPort = await freePort();
const child = spawn(path.join(root, 'build/CarterMedia/CarterMedia.exe'), ['--profile', profile], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${hostPort}`, CARTERMEDIA_VIDEO_DEBUG_PORT: String(videoPort) },
  windowsHide: true,
  stdio: 'ignore',
});
let host, video;
const report = {};
try {
  host = await connect(hostPort, item => item.type === 'page' && item.url.includes('tauri.localhost'));
  await host.until("Boolean(qa.link('/videos'))");
  await host.evaluate("qa.link('/videos').click()");
  await host.until("window.__TAURI_INTERNALS__.invoke('video_engine_status').then(state=>state.ready&&state.visible)");
  video = await connect(videoPort, item => item.type === 'page' && item.url.startsWith('app:'));
  await video.until("qa.linksContaining('/watch/').length>0");
  const watchRoute = await video.evaluate("qa.linksContaining('/watch/')[0].getAttribute('href')");
  await video.evaluate(`location.hash=${JSON.stringify(watchRoute.slice(watchRoute.indexOf('#') + 1))}`);
  await video.until("qa.tag('video')?.readyState>=2", 45000);
  await video.evaluate("qa.tag('video').muted=true;qa.tag('video').play()");
  await delay(1500);
  await video.evaluate("globalThis.qaFullscreen=[];document.addEventListener('fullscreenchange',()=>qaFullscreen.push({time:performance.now(),fullscreen:document.fullscreenElement?.className}));document.addEventListener('fullscreenerror',()=>qaFullscreen.push({error:true,time:performance.now()}))");
  report.before = await video.evaluate("({path:location.hash,enabled:document.fullscreenEnabled,focused:document.hasFocus(),fullscreen:document.fullscreenElement?.className,buttons:qa.byClass('shaka-fullscreen-button').map(element=>({text:element.innerText,label:element.getAttribute('aria-label'),disabled:element.disabled,rect:{x:element.getBoundingClientRect().x,y:element.getBoundingClientRect().y,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height}}))})");
  console.log(JSON.stringify(report));
  await video.evaluate("qa.byClass('shaka-fullscreen-button')[0].click()");
  await delay(2000);
  report.after = await video.evaluate("({fullscreen:document.fullscreenElement?.className,active:document.activeElement?.className,events:qaFullscreen})");
  report.native = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
  report.errors = video.errors;
  report.exceptions = video.exceptions;
  if (!report.native.fullscreen) {
    try {
      await video.evaluate("qa.tag('video').parentElement.requestFullscreen()");
      report.directRequest = 'accepted';
    } catch (error) { report.directRequest = error.message; }
    await video.send('Page.bringToFront');
    await delay(300);
    try {
      await video.evaluate("qa.tag('video').parentElement.requestFullscreen()");
      report.focusedRequest = 'accepted';
    } catch (error) { report.focusedRequest = error.message; }
    await delay(1500);
    report.final = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure=error.stack;
  if (video) report.state = await video.evaluate("({path:location.hash,text:document.body.innerText.slice(-1200),fullscreen:document.fullscreenElement?.className})").catch(()=>null);
  console.log(JSON.stringify(report, null, 2));
} finally {
  video?.close(); host?.close(); child.kill();
}
