import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, delay, freePort } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = 'display-' + Date.now();
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
  await delay(4000);
  report.native = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
  report.before = await video.evaluate("({visibility:document.visibilityState,hidden:document.hidden,width:innerWidth,height:innerHeight,text:document.body.innerText.slice(0,250),frames:globalThis.qaFrames=0})");
  await video.evaluate("globalThis.qaCounting=true;function tick(){qaFrames++;if(qaCounting)requestAnimationFrame(tick)};requestAnimationFrame(tick)");
  await delay(2000);
  report.animationFrames = await video.evaluate("globalThis.qaCounting=false;qaFrames");
  console.log(JSON.stringify(report, null, 2));
  for (const fromSurface of [true]) {
    try {
      const capture = await video.send('Page.captureScreenshot', { fromSurface, captureBeyondViewport: false, optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1000, height: 700, scale: 1 } });
      fs.writeFileSync(path.join(root, `qa/diagnostic-${fromSurface}.png`), Buffer.from(capture.data, 'base64'));
      report['capture' + fromSurface] = 'passed';
    } catch (error) { report['capture' + fromSurface] = error.message; }
  }
  console.log(JSON.stringify(report, null, 2));
  if (process.env.CARTERMEDIA_VISUAL_QA) await delay(30000);
} finally {
  video?.close();
  host?.close();
  child.kill();
}
