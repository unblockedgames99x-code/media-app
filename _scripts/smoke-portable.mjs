import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  executable = path.join(directory, file);
}
executable = path.resolve(executable);
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
  ...(platform === 'linux' && executable.endsWith('.AppImage') ? { APPIMAGE_EXTRACT_AND_RUN: '1' } : {}),
};
const report = { platform, arch: values.arch, startedAt: new Date().toISOString() };
let application;
let video;
let host;
let logs = '';
let launchError;

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

try {
  application = launch();
  video = await connect(videoPort, item => item.type === 'page' && item.url.startsWith('app:'), 60000);
  const mode = platform === 'windows' ? 'embedded' : 'handoff';
  await video.until(`document.documentElement.dataset.workspaceMode===${JSON.stringify(mode)}&&location.hash===${JSON.stringify(`#/watch/${videoId}`)}`);
  report.workspace = await video.evaluate("({mode:document.documentElement.dataset.workspaceMode,route:location.hash,returnAvailable:typeof window.mediaWorkspace?.returnToMusic==='function',buttons:document.getElementsByTagName('button').length})");
  assert.equal(report.workspace.returnAvailable, true);
  assert(report.workspace.buttons > 0, 'The packaged video interface did not render.');
  await video.until("(()=>{const stylesheets=[...document.getElementsByTagName('link')].filter(element=>element.relList.contains('stylesheet'));return stylesheets.length>0&&stylesheets.every(element=>element.sheet&&element.sheet.cssRules.length>0)})()");
  report.stylesheets = await video.evaluate("[...document.getElementsByTagName('link')].filter(element=>element.relList.contains('stylesheet')).map(element=>({loaded:Boolean(element.sheet),rules:element.sheet?.cssRules.length??0}))");

  if (platform === 'linux') {
    const listing = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
    const rendererPids = listing.split('\n').filter(line => line.includes('media-video') && line.includes('--type=renderer'))
      .map(line => Number(line.trim().split(/\s+/, 1)[0]));
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
    await video.until('!document.hidden');
    await video.evaluate('window.mediaWorkspace.returnToMusic()');
    await video.until('document.hidden');
    report.returnToMusic = true;
    const reopened = launch();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The second app instance did not exit.')), 15000);
      reopened.once('exit', code => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error(`The second app instance exited with ${code}.`));
      });
      reopened.once('error', reject);
    });
    await video.until('!document.hidden');
    report.reopenedVideos = true;
  } else {
    host = await connect(hostPort, item => item.type === 'page' && /tauri\.localhost|tauri:/.test(item.url));
    const inspection = await host.evaluate("window.__TAURI_INTERNALS__.invoke('video_engine_status')");
    assert.equal(inspection.ready, true);
    assert.equal(inspection.visible, true);
    assert.equal(inspection.hwnd !== null, true);
    report.nativeEmbedding = true;
  }

  video.close();
  video = undefined;
  host?.close();
  host = undefined;
  application.kill();
  const deadline = Date.now() + 15000;
  while (await portIsOpen()) {
    assert(Date.now() < deadline, 'The video engine remained alive after its host exited.');
    await delay(250);
  }
  report.childExitedWithHost = true;
  report.passed = true;
  process.stdout.write(`Packaged ${platform} ${values.arch} runtime passed: video startup, workspace navigation, ${platform === 'windows' ? 'native embedding' : 'Music return and Videos reopen'}, child cleanup${platform === 'linux' ? ', renderer sandbox' : ''}.\n`);
} catch (error) {
  report.passed = false;
  report.error = launchError?.message ?? error.message;
  await writeFile(path.join(output, 'runtime.log'), logs);
  throw error;
} finally {
  video?.close();
  host?.close();
  application?.kill();
  await writeFile(path.join(output, 'runtime.json'), JSON.stringify(report, null, 2));
  await delay(1500);
  await rm(profileDirectory, { recursive: true, force: true });
}
