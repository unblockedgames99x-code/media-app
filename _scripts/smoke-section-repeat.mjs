import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { connect, delay, freePort } from './cdp.mjs';

assert(
  process.platform === 'win32' &&
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.RUNNER_OS === 'Windows' &&
    process.env.RUNNER_ENVIRONMENT === 'github-hosted',
  'Section repeat playback verification runs only on a GitHub-hosted Windows runner.',
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: { arch: { type: 'string', default: process.arch } },
});
assert.equal(values.arch, process.arch);
const configuration = JSON.parse(
  await readFile(
    path.join(root, 'packages/player/src-tauri/tauri.conf.json'),
    'utf8',
  ),
);
const executable = path.join(
  root,
  `build/Media-${configuration.version}-windows-${values.arch}-portable/Media.exe`,
);
await access(executable);
const profile = `qa-section-repeat-${Date.now()}-${randomUUID()}`;
const identifier = `${configuration.identifier}.profile.${profile}`;
assert(process.env.APPDATA && process.env.LOCALAPPDATA);
const profileDirectory = path.join(
  path.resolve(process.env.APPDATA),
  identifier,
);
const profileCache = path.join(
  path.resolve(process.env.LOCALAPPDATA),
  identifier,
);
assert.equal(path.dirname(profileDirectory), path.resolve(process.env.APPDATA));
assert.equal(
  path.dirname(profileCache),
  path.resolve(process.env.LOCALAPPDATA),
);
const output = path.join(
  root,
  'build/verify',
  `windows-${values.arch}`,
  'section-repeat',
);
await mkdir(output, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  source: process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  transport:
    'Packaged WebView2 audio playback; CDP UI actions and read-only audio clock observations',
  executable,
  profile,
  checks: {},
  requests: [],
};
let application;
let host;
let logs = '';
let stage = 'fixtures';
const save = () =>
  writeFile(
    path.join(output, 'section-repeat.json'),
    JSON.stringify(report, null, 2),
  );
const checkpoint = async (name, value) => {
  report.checks[name] = value;
  await save();
  process.stdout.write(`Section repeat: ${name}\n`);
};

const createWave = (frequency) => {
  const sampleRate = 16000;
  const frames = sampleRate * 16;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++) {
    buffer.writeInt16LE(
      Math.round(
        Math.sin((frame * frequency * 2 * Math.PI) / sampleRate) * 1800,
      ),
      44 + frame * 2,
    );
  }
  return buffer;
};
const assets = new Map([
  ['/first.wav', createWave(220)],
  ['/second.wav', createWave(330)],
]);
const server = http.createServer((request, response) => {
  const asset = assets.get(request.url);
  if (!asset || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  const range = request.headers.range;
  const match = range && /^bytes=(\d+)-(\d*)$/.exec(range);
  const start = match ? Number(match[1]) : 0;
  const end =
    match && match[2]
      ? Math.min(Number(match[2]), asset.length - 1)
      : asset.length - 1;
  if ((range && !match) || start > end || start >= asset.length) {
    response
      .writeHead(416, { 'Content-Range': `bytes */${asset.length}` })
      .end();
    return;
  }
  const headers = {
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Access-Control-Allow-Origin': '*',
  };
  if (range) {
    headers['Content-Range'] = `bytes ${start}-${end}/${asset.length}`;
  }
  report.requests.push({
    path: request.url,
    method: request.method,
    range,
    status: range ? 206 : 200,
  });
  if (report.requests.length > 40) {
    report.requests.shift();
  }
  response.writeHead(range ? 206 : 200, headers);
  response.end(
    request.method === 'HEAD' ? undefined : asset.subarray(start, end + 1),
  );
});

const sample = () =>
  host.evaluate(
    `(()=>{const audio=qa.tag('audio');return {title:qa.testId('now-playing-title')?.textContent,time:audio?.currentTime,duration:audio?.duration,paused:audio?.paused,ended:audio?.ended,readyState:audio?.readyState,error:audio?.error?.message??null,source:audio?.currentSrc}})()`,
  );
const click = (label) =>
  host.evaluate(
    `(()=>{const button=[...document.getElementsByTagName('button')].find(element=>element.getAttribute('aria-label')===${JSON.stringify(label)}||element.textContent.trim()===${JSON.stringify(label)});if(!button||button.disabled)throw Error('Unavailable button: '+${JSON.stringify(label)});button.click()})()`,
  );
const clickId = (id) =>
  host.evaluate(
    `(()=>{const button=qa.testId(${JSON.stringify(id)});if(!button||button.disabled)throw Error('Unavailable control: '+${JSON.stringify(id)});button.click()})()`,
  );
const enterTime = (label, value) =>
  host.evaluate(
    `(()=>{const label=[...document.getElementsByTagName('label')].find(element=>element.textContent.trim()===${JSON.stringify(label)});const input=label&&(label.control||label.getElementsByTagName('input')[0]);if(!input)throw Error('Unavailable time field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
const closePanel = async () => {
  await click('Repeat section (A–B)');
  await host.until("!qa.testId('section-repeat-status')", 5000);
};
const waitPlaying = async (title) => {
  await host.until(
    `qa.tag('audio')&&!qa.tag('audio').paused&&qa.tag('audio').readyState>=2&&qa.testId('now-playing-title')?.textContent===${JSON.stringify(title)}`,
    30000,
  );
  const before = await sample();
  await host.until(`qa.tag('audio').currentTime>${before.time + 0.5}`, 5000);
  const after = await sample();
  assert.equal(after.error, null);
  return { before, after };
};
const observeLoops = async (count) => {
  const samples = [];
  const wraps = [];
  let previous = await sample();
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline && wraps.length < count) {
    await delay(80);
    const current = await sample();
    assert.equal(current.paused, false);
    assert.equal(current.error, null);
    assert.equal(current.title, 'Section repeat fixture one');
    assert(
      current.time >= 0.9 && current.time < 3.3,
      `Audio escaped the selected section: ${current.time}`,
    );
    samples.push(current.time);
    if (previous.time - current.time > 0.5) {
      assert(
        previous.time > 2.4 && current.time < 1.4,
        'Audio wrapped outside the A–B boundary.',
      );
      wraps.push({ from: previous.time, to: current.time });
    }
    previous = current;
  }
  assert.equal(
    wraps.length,
    count,
    'The real audio clock did not repeat the section.',
  );
  return { wraps, samples };
};
const screenshot = async () => {
  const capture = await host.send('Page.captureScreenshot', {
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(
    path.join(output, 'section-repeat.png'),
    Buffer.from(capture.data, 'base64'),
  );
};

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const pluginId = 'section-repeat-qa';
  const pluginDirectory = path.join(
    profileDirectory,
    'plugins',
    pluginId,
    '1.0.0',
  );
  await mkdir(pluginDirectory, { recursive: true });
  const writeProfile = (filename, data) =>
    writeFile(
      path.join(profileDirectory, filename),
      JSON.stringify(data, null, 2),
    );
  const now = new Date().toISOString();
  await writeProfile('personalization.json', {
    'media-personalization': { state: { setupCompleted: true }, version: 1 },
  });
  await writeProfile('default-sources.json', {
    setup: { version: 1, completed: true, completedPluginIds: [] },
  });
  await writeProfile('settings.json', {
    'core.general.language': 'en_US',
    'core.plugins.autoUpdate': false,
    'core.playback.repeat': 'off',
    'core.playback.shuffle': false,
    'core.playback.discovery': false,
    'core.playback.muted': true,
    'core.playback.volume': 0,
  });
  await writeProfile('active-providers.json', {
    active: { streaming: pluginId },
  });
  await writeProfile('plugins.json', {
    [`plugins.${pluginId}`]: {
      id: pluginId,
      version: '1.0.0',
      path: pluginDirectory,
      installationMethod: 'dev',
      enabled: true,
      installedAt: now,
      lastUpdatedAt: now,
    },
  });
  await writeFile(
    path.join(pluginDirectory, 'package.json'),
    JSON.stringify({
      name: pluginId,
      version: '1.0.0',
      description: 'Isolated section repeat audio verification',
      author: 'Media QA',
      main: 'index.js',
    }),
  );
  await writeFile(
    path.join(pluginDirectory, 'index.js'),
    `module.exports={onEnable(api){api.Providers.register({id:${JSON.stringify(pluginId)},kind:'streaming',name:'Section repeat QA',searchForTrackV2:async()=>{throw Error('Expected a cached fixture candidate')},getStreamUrlV2:async()=>{throw Error('Expected a fresh fixture stream')}})}};`,
  );
  const tracks = ['one', 'two'].map((name, index) => {
    const id = index === 0 ? 'first' : 'second';
    const source = { provider: pluginId, id };
    return {
      id: randomUUID(),
      status: 'idle',
      addedAtIso: now,
      track: {
        title: `Section repeat fixture ${name}`,
        artists: [{ name: 'Media QA', roles: ['primary'] }],
        durationMs: 16000,
        source,
        streamCandidates: [
          {
            id,
            title: `Section repeat fixture ${name}`,
            failed: false,
            source,
            lastResolvedAtIso: now,
            durationMs: 16000,
            stream: {
              url: `http://127.0.0.1:${port}/${id}.wav`,
              protocol: 'http',
              mimeType: 'audio/wav',
              durationMs: 16000,
              source,
            },
          },
        ],
      },
    };
  });
  await writeProfile('queue.json', {
    'queue.items': tracks,
    'queue.currentIndex': 0,
  });
  report.fixtures = [...assets].map(([filename, data]) => ({
    filename,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    seconds: 16,
  }));
  const hostPort = await freePort();
  stage = 'launch';
  application = spawn(executable, ['--profile', profile], {
    windowsHide: true,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${hostPort} --remote-debugging-address=127.0.0.1`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  application.stdout.on('data', (data) => {
    logs = (logs + data).slice(-24000);
  });
  application.stderr.on('data', (data) => {
    logs = (logs + data).slice(-24000);
  });
  application.on('error', (error) => {
    logs += `\n${error.message}`;
  });
  host = await connect(
    hostPort,
    (item) => item.type === 'page' && /tauri\.localhost|tauri:/.test(item.url),
    45000,
  );
  await host.until("Boolean(qa.testId('player-play-button'))", 30000);
  await clickId('player-play-button');
  await checkpoint(
    'realAudioStarted',
    await waitPlaying(tracks[0].track.title),
  );
  stage = 'configure-section';
  await click('Repeat section (A–B)');
  await host.until("Boolean(qa.testId('section-repeat-status'))", 5000);
  await enterTime('Start (A)', '0:01');
  await enterTime('End (B)', '0:03');
  await click('Loop section');
  await host.until(
    "qa.testId('section-repeat-status')?.textContent==='Looping 0:01 – 0:03'",
    5000,
  );
  await checkpoint(
    'selectedSection',
    await host.evaluate(
      "({status:qa.testId('section-repeat-status').textContent,pressed:[...document.getElementsByTagName('button')].find(button=>button.getAttribute('aria-label')==='Repeat section (A–B)').getAttribute('aria-pressed')})",
    ),
  );
  assert.equal(report.checks.selectedSection.pressed, 'true');
  await screenshot();
  await closePanel();
  stage = 'repeat-real-audio';
  await checkpoint('repeatedTwice', await observeLoops(2));
  stage = 'pause';
  await clickId('player-pause-button');
  await host.until("qa.tag('audio').paused", 5000);
  const pausedAt = await sample();
  await delay(1400);
  const stillPaused = await sample();
  assert.equal(stillPaused.paused, true);
  assert(
    Math.abs(stillPaused.time - pausedAt.time) < 0.1,
    'Paused section audio continued advancing.',
  );
  await checkpoint('pauseFreezes', { pausedAt, stillPaused });
  stage = 'resume';
  await clickId('player-play-button');
  await host.until("!qa.tag('audio').paused", 5000);
  await checkpoint('resumeRepeats', await observeLoops(1));
  stage = 'next-track';
  await clickId('player-next-button');
  await checkpoint('nextTrackPlays', await waitPlaying(tracks[1].track.title));
  await click('Repeat section (A–B)');
  await host.until(
    "qa.testId('section-repeat-status')?.textContent==='Choose a start and end'",
    5000,
  );
  const cleared = await host.evaluate(
    "({status:qa.testId('section-repeat-status').textContent,pressed:[...document.getElementsByTagName('button')].find(button=>button.getAttribute('aria-label')==='Repeat section (A–B)').getAttribute('aria-pressed')})",
  );
  assert.equal(cleared.pressed, 'false');
  await checkpoint('nextTrackClearsSection', cleared);
  await closePanel();
  await host.until(
    "qa.tag('audio').currentTime>3.5&&!qa.tag('audio').paused",
    6000,
  );
  await checkpoint('nextTrackPassesOldEnd', await sample());
  assert(report.requests.some((request) => request.path === '/first.wav'));
  assert(report.requests.some((request) => request.path === '/second.wav'));
  assert.equal(host.exceptions.length, 0, host.exceptions.join('\n'));
  report.success = true;
  stage = 'complete';
} catch (error) {
  report.failure = { stage, message: error.message, stack: error.stack };
  if (host) {
    try {
      report.failure.playback = await sample();
      report.failure.text = await host.evaluate('document.body.innerText');
      await screenshot();
    } catch (captureError) {
      report.failure.captureError = captureError.message;
    }
  }
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
} finally {
  if (host) {
    try {
      await host.evaluate(
        "window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})",
      );
    } catch (error) {
      report.closeConnectionMessage = error.message;
    }
    host.close();
  }
  if (application) {
    for (
      let attempt = 0;
      attempt < 20 &&
      application.exitCode === null &&
      application.signalCode === null;
      attempt++
    ) {
      await delay(250);
    }
    if (application.exitCode === null && application.signalCode === null) {
      application.kill();
    }
    for (
      let attempt = 0;
      attempt < 20 &&
      application.exitCode === null &&
      application.signalCode === null;
      attempt++
    ) {
      await delay(250);
    }
    report.applicationExited =
      application.exitCode !== null || application.signalCode !== null;
    if (!report.applicationExited) {
      report.cleanupError = 'The owned application did not exit.';
      process.exitCode = 1;
    }
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  try {
    await rm(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 15,
      retryDelay: 200,
    });
    await rm(profileCache, {
      recursive: true,
      force: true,
      maxRetries: 15,
      retryDelay: 200,
    });
    report.profileRemoved = true;
  } catch (error) {
    report.cleanupError = error.message;
    process.exitCode = 1;
  }
  report.stage = stage;
  report.success = report.success === true && !process.exitCode;
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'section-repeat.log'), logs);
  await save();
}
