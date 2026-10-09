import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { connect, delay, freePort } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  arch: { type: 'string', default: process.arch },
  target: { type: 'string' },
  executable: { type: 'string' },
} });
const platform = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform];
assert(platform, 'Run the packaged smoke on Windows, Linux, or macOS.');
assert.equal(values.arch, process.arch, 'Runtime checks require a matching runner architecture.');
const configuration = JSON.parse(await readFile(path.join(root, 'packages/player/src-tauri/tauri.conf.json'), 'utf8'));
const target = values.target;
const release = path.join(root, 'packages/player/src-tauri/target', ...(target ? [target] : []), 'release');
let executable = values.executable;
if (!executable && platform === 'windows') {
  executable = path.join(root, `build/Media-${configuration.version}-windows-${values.arch}-portable/Media.exe`);
} else if (!executable && platform === 'macos') {
  executable = path.join(release, 'bundle/macos/Media.app/Contents/MacOS/Media');
} else if (!executable) {
  const directory = path.join(root, 'build/releases');
  const file = (await readdir(directory)).find(name => name.includes(`-linux-${values.arch}`) && name.endsWith('.AppImage'));
  assert(file, 'The packaged Linux AppImage is missing.');
  executable = path.join(root, 'build/verify', `${platform}-${values.arch}`, 'squashfs-root/AppRun');
}
executable = path.resolve(executable);
await access(executable);
const profile = `qa-runtime-${Date.now()}-${process.pid}`;
const identifier = `${configuration.identifier}.profile.${profile}`;
const dataRoot = platform === 'windows' ? process.env.APPDATA
  : platform === 'macos' ? path.join(os.homedir(), 'Library/Application Support')
    : process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local/share');
assert(dataRoot, 'The application data directory is unavailable.');
const profileDirectory = path.join(path.resolve(dataRoot), identifier);
assert.equal(path.dirname(profileDirectory), path.resolve(dataRoot));
const output = path.join(root, 'build/verify', `${platform}-${values.arch}`);
await mkdir(output, { recursive: true });
await mkdir(profileDirectory, { recursive: true });
await writeFile(path.join(profileDirectory, 'personalization.json'), JSON.stringify({
  'media-personalization': { state: { setupCompleted: true }, version: 1 },
}));

const videoPort = await freePort();
const hostPort = await freePort();
const videoId = 'aaaaaaaaaaa';
const link = `cartermedia://watch/${videoId}`;
const environment = {
  ...process.env,
  CARTERMEDIA_VIDEO_DEBUG_PORT: String(videoPort),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${hostPort} --remote-debugging-address=127.0.0.1`,
};
const report = {
  platform,
  arch: values.arch,
  startedAt: new Date().toISOString(),
  sharedSessionBus: Boolean(process.env.DBUS_SESSION_BUS_ADDRESS),
  stage: 'launch',
  progress: [],
};
let application;
let reopened;
let video;
let host;
let nativeHostPid;
let logs = '';
let launchError;

const recordProgress = entry => {
  report.progress.push({ ...entry, at: new Date().toISOString() });
  if (report.progress.length > 80) report.progress.shift();
};
const stage = name => {
  report.stage = name;
  process.stdout.write(`Packaged runtime: ${name}\n`);
};

const launch = () => {
  const child = spawn(executable, ['--profile', profile, link], {
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', error => { launchError = error; });
  child.stdout.on('data', data => { logs = (logs + data).slice(-16000); });
  child.stderr.on('data', data => { logs = (logs + data).slice(-16000); });
  return child;
};

const portIsOpen = async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${videoPort}/json/list`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
};

const stopApplication = () => {
  if (reopened && reopened.exitCode === null && reopened.signalCode === null) {
    reopened.kill();
  }
  if (nativeHostPid && nativeHostPid !== application?.pid) {
    try {
      process.kill(nativeHostPid);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  } else {
    application?.kill();
  }
};

try {
  application = launch();
  stage('connect-video');
  video = await connect(videoPort, item => item.type === 'page' && item.url.startsWith('app:'), 60000, recordProgress);
  stage('initialize-video');
  const mode = platform === 'windows' ? 'embedded' : 'handoff';
  await video.until(`document.documentElement.dataset.workspaceMode===${JSON.stringify(mode)}&&location.hash===${JSON.stringify(`#/watch/${videoId}`)}`);
  report.workspace = await video.evaluate("({mode:document.documentElement.dataset.workspaceMode,route:location.hash,returnAvailable:typeof window.mediaWorkspace?.returnToMusic==='function',buttons:document.getElementsByTagName('button').length})");
  assert.equal(report.workspace.returnAvailable, true);
  assert(report.workspace.buttons > 0, 'The packaged video interface did not render.');
  stage('inspect-window-and-styles');
  report.windowState = await video.evaluate('window.mediaWorkspace.getWindowState()');
  assert.equal(typeof report.windowState.visible, 'boolean');
  assert(Number.isSafeInteger(report.windowState.returnRevision));
  await video.until("(()=>{const stylesheets=[...document.getElementsByTagName('link')].filter(element=>element.relList.contains('stylesheet'));return stylesheets.length>0&&stylesheets.every(element=>element.sheet&&element.sheet.cssRules.length>0)})()");
  report.stylesheets = await video.evaluate("[...document.getElementsByTagName('link')].filter(element=>element.relList.contains('stylesheet')).map(element=>({loaded:Boolean(element.sheet),rules:element.sheet?.cssRules.length??0}))");

  if (platform === 'linux') {
    const listing = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' });
    const processes = listing.split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
      .filter(Boolean).map(match => ({ pid: Number(match[1]), parentPid: Number(match[2]), args: match[3] }));
    const engine = processes.filter(item => item.args.includes('media-video') &&
      item.args.includes(path.join(profileDirectory, 'video')) && !item.args.includes('--type='));
    assert.equal(engine.length, 1, 'The isolated video engine process could not be identified.');
    nativeHostPid = engine[0].parentPid;
    assert(nativeHostPid > 1 && nativeHostPid !== process.pid, 'The native application process could not be identified.');
    assert(report.sharedSessionBus, 'Packaged Linux checks need a shared desktop D-Bus session.');
    const busOwner = execFileSync('dbus-send', [
      '--session', '--dest=org.freedesktop.DBus', '--type=method_call', '--print-reply',
      '/org/freedesktop/DBus', 'org.freedesktop.DBus.GetConnectionUnixProcessID',
      `string:${identifier}.SingleInstance`,
    ], { encoding: 'utf8', timeout: 5000 });
    report.singleInstanceOwnerPid = Number(/uint32\s+(\d+)/.exec(busOwner)?.[1]);
    assert.equal(report.singleInstanceOwnerPid, nativeHostPid, 'The shared desktop session does not identify this application as the profile singleton.');
    const rendererPids = processes.filter(item => item.args.includes('media-video') && item.args.includes('--type=renderer'))
      .map(item => item.pid);
    assert(rendererPids.length > 0, 'No Electron renderer process is running.');
    report.rendererSandbox = [];
    for (const pid of rendererPids) {
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      assert.match(status, /^Seccomp:\s+2$/m, 'The video renderer seccomp sandbox is inactive.');
      assert.match(status, /^NoNewPrivs:\s+1$/m, 'The video renderer can acquire new privileges.');
      report.rendererSandbox.push({ seccomp: 2, noNewPrivileges: true });
    }
    assert(!listing.split('\n').some(line => line.includes('media-video') && line.includes('--no-sandbox')), 'The video engine was launched without sandboxing.');
  }

  if (platform !== 'windows') {
    stage('return-to-music');
    await video.until('window.mediaWorkspace.getWindowState().then(state=>state.visible)');
    const beforeReturn = await video.evaluate('window.mediaWorkspace.getWindowState()');
    await video.evaluate('window.mediaWorkspace.returnToMusic()');
    await video.until(`window.mediaWorkspace.getWindowState().then(state=>!state.visible&&state.returnRevision>${beforeReturn.returnRevision})`);
    await delay(1500);
    report.returnToMusic = true;
    stage('reopen-videos');
    reopened = launch();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The second app instance did not exit.')), 35000);
      reopened.once('exit', code => {
        clearTimeout(timeout);
        report.secondInstanceExitCode = code;
        code === 0 ? resolve() : reject(new Error(`The second app instance exited with ${code}.`));
      });
      reopened.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    await video.until('window.mediaWorkspace.getWindowState().then(state=>state.visible)');
    report.reopenedVideos = true;
  } else {
    host = await connect(hostPort, item => item.type === 'page' && /tauri\.localhost|tauri:/.test(item.url));
    const inspection = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
    assert.equal(inspection.ready, true);
    assert.equal(inspection.visible, true);
    assert.equal(inspection.hwnd !== null, true);
    report.nativeEmbedding = true;

    stage('video-keyboard-focus');
    const searchInput = "qa.byClass('searchInput')[0]?.getElementsByTagName('input')[0]";
    await video.until(`(()=>{const input=${searchInput};if(!input||input.disabled)return false;const bounds=input.getBoundingClientRect();return bounds.width>0&&bounds.height>0})()`);
    const focusState = `(()=>{const input=${searchInput};return {active:document.activeElement===input,documentFocused:document.hasFocus(),value:input.value}})()`;
    const inputBounds = await video.evaluate(`(()=>{const bounds=(${searchInput}).getBoundingClientRect();return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,width:bounds.width,height:bounds.height}})()`);
    report.videoInputFocus = {
      transport: 'Chromium DevTools mouse and keyboard events',
      bounds: inputBounds,
      before: await video.evaluate(focusState),
    };
    assert.equal(report.videoInputFocus.before.value, '', 'The fresh video search field is not empty.');
    const inputPoint = { x: inputBounds.x, y: inputBounds.y };
    await video.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...inputPoint });
    await video.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...inputPoint, button: 'left', clickCount: 1 });
    await video.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...inputPoint, button: 'left', clickCount: 1 });
    report.videoInputFocus.afterClick = await video.evaluate(focusState);
    await video.until(`document.activeElement===(${searchInput})&&document.hasFocus()`, 5000);
    report.videoInputFocus.afterClick = await video.evaluate(focusState);
    assert.equal(report.videoInputFocus.afterClick.active, true, 'Clicking the video search field did not activate it.');
    assert.equal(report.videoInputFocus.afterClick.documentFocused, true, 'The visible embedded video document did not gain keyboard focus.');
    const typedText = 'focus';
    for (const character of typedText) {
      const key = { key: character, code: `Key${character.toUpperCase()}`, windowsVirtualKeyCode: character.toUpperCase().charCodeAt(0) };
      await video.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: character, unmodifiedText: character });
      await video.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    }
    report.videoInputFocus.afterKeys = await video.evaluate(focusState);
    assert.equal(report.videoInputFocus.afterKeys.value, typedText, 'Video search did not receive dispatched keyboard input.');
    assert.equal(report.videoInputFocus.afterKeys.active, true, 'The video search field lost focus while typing.');
    assert.equal(report.videoInputFocus.afterKeys.documentFocused, true, 'The embedded video document lost keyboard focus while typing.');
    report.videoInputFocus.passed = true;
  }

  stage('video-home-appearance');
  await video.evaluate("location.hash='#/home'");
  await video.until("qa.byClass('homeIntro')[0]?.getElementsByTagName('h1')[0]?.textContent.trim()==='Goodtube - Noads No sponsors No distractions'");
  report.videoHome = await video.evaluate("(()=>{const intro=qa.byClass('homeIntro')[0];return {heading:intro.getElementsByTagName('h1')[0].textContent.trim(),textAlign:getComputedStyle(intro).textAlign,filters:qa.byClass('feedTab').map(button=>button.textContent.trim()),refresh:qa.byClass('refreshButton')[0]?.textContent.trim()}})()");
  assert.equal(report.videoHome.textAlign, 'center', 'The video home heading is not centered.');
  assert.equal(report.videoHome.filters.length, 4, 'The video feed filters are missing.');
  assert.equal(report.videoHome.refresh, 'Refresh', 'The feed refresh control is missing.');
  const homeScreenshot = await video.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, 'runtime.home.png'), Buffer.from(homeScreenshot.data, 'base64'));

  stage('close-host-and-video');
  video.close();
  video = undefined;
  host?.close();
  host = undefined;
  stopApplication();
  const deadline = Date.now() + 15000;
  while (await portIsOpen()) {
    assert(Date.now() < deadline, 'The video engine remained alive after its host exited.');
    await delay(250);
  }
  report.childExitedWithHost = true;
  report.passed = true;
  stage('complete');
  process.stdout.write(`Packaged ${platform} ${values.arch} runtime passed: video startup, workspace navigation, ${platform === 'windows' ? 'native embedding and Chromium keyboard input' : 'Music return and Videos reopen'}, child cleanup${platform === 'linux' ? ', renderer sandbox' : ''}.\n`);
} catch (error) {
  report.passed = false;
  report.error = launchError?.message ?? error.message;
  report.applicationExit = { code: application?.exitCode, signal: application?.signalCode };
  report.rendererErrors = video?.errors ?? [];
  report.rendererExceptions = video?.exceptions ?? [];
  if (video) {
    try {
      const capture = await Promise.race([
        video.send('Page.captureScreenshot', { format: 'png' }),
        delay(1500).then(() => null),
      ]);
      if (capture?.data) await writeFile(path.join(output, 'runtime.png'), Buffer.from(capture.data, 'base64'));
    } catch {}
  }
  if (platform !== 'windows') {
    try {
      report.failedWindowState = await Promise.race([
        video?.evaluate('window.mediaWorkspace.getWindowState()') ?? Promise.resolve({ unavailable: true }),
        delay(1500).then(() => ({ unavailable: true })),
      ]);
    } catch {
      report.failedWindowState = { unavailable: true };
    }
    try {
      const listing = execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' });
      report.nativeProcesses = listing.split('\n')
        .map(line => /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line))
        .filter(Boolean)
        .filter(match => match[4].includes(profile) ||
          [application?.pid, reopened?.pid, nativeHostPid].includes(Number(match[1])))
        .map(match => ({ pid: Number(match[1]), parentPid: Number(match[2]), name: match[3] }));
    } catch {
      report.nativeProcesses = { unavailable: true };
    }
  }
  if (platform === 'macos') {
    try {
      const directory = path.join(os.homedir(), 'Library/Logs/DiagnosticReports');
      report.crashes = [];
      for (const name of (await readdir(directory)).filter(name => /^(media-video|Media Video|Electron|Media)[_. -]/i.test(name))) {
        const filename = path.join(directory, name);
        if ((await stat(filename)).mtimeMs < Date.parse(report.startedAt) - 5000) continue;
        const content = await readFile(filename, 'utf8');
        const newline = content.indexOf('\n');
        const details = JSON.parse(content.slice(newline + 1));
        const fault = details.threads?.[details.faultingThread];
        report.crashes.push({
          process: details.procName,
          exception: details.exception,
          termination: details.termination,
          frames: fault?.frames?.slice(0, 12).map(frame => ({ symbol: frame.symbol, imageIndex: frame.imageIndex })),
        });
      }
    } catch {
      report.crashes = { unavailable: true };
    }
  }
  await writeFile(path.join(output, 'runtime.log'), logs);
  throw error;
} finally {
  video?.close();
  host?.close();
  stopApplication();
  await writeFile(path.join(output, 'runtime.json'), JSON.stringify(report, null, 2));
  await delay(1500);
  await rm(profileDirectory, { recursive: true, force: true });
}
