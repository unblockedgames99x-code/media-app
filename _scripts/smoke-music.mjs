import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { connect, delay, freePort } from './cdp.mjs';
import { protectQaWindow } from './qa-window.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa');
const executable = process.env.CARTERMEDIA_EXE || path.join(root, 'build/Media-1.50.0-windows-x64-portable/Media.exe');
const report = { startedAt: new Date().toISOString(), executable, checks: {}, errors: [] };
fs.mkdirSync(output, { recursive: true });
const save = () => fs.writeFileSync(path.join(output, 'music-smoke-report.json'), JSON.stringify(report, null, 2));
const checkpoint = (name, value) => { report.checks[name] = value; save(); console.log(name, JSON.stringify(value)); };
let host;
let processHandle;
let logs = '';

const clickText = async text => {
  await host.until(`(()=>{const element=[...document.getElementsByTagName('*')].find(element=>!element.disabled&&(['BUTTON','A'].includes(element.tagName)||['button','tab'].includes(element.getAttribute('role')))&&element.textContent.trim()===${JSON.stringify(text)});if(!element)return false;element.click();return true})()`, 15000);
  await delay(300);
};
const press = async (key, code = key, windowsVirtualKeyCode = 0) => {
  await host.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
  await host.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
};
const screenshot = async name => fs.writeFileSync(path.join(output, name), Buffer.from((await host.send('Page.captureScreenshot', { fromSurface: true, captureBeyondViewport: false })).data, 'base64'));
const sample = async () => host.evaluate(`(()=>{const audio=qa.tag('audio');return {title:qa.testId('now-playing-title')?.textContent,paused:audio?.paused,time:audio?.currentTime,duration:audio?.duration,readyState:audio?.readyState,volume:audio?.volume,muted:audio?.muted,error:audio?.error?.message||null,buffered:audio?[...Array(audio.buffered.length)].map((_,index)=>[audio.buffered.start(index),audio.buffered.end(index)]):[]}})()`);
const waitPlaying = async title => {
  await host.until(`qa.tag('audio')&&!qa.tag('audio').paused&&qa.tag('audio').readyState>=2&&qa.testId('now-playing-title')?.textContent===${JSON.stringify(title)}`, 90000);
  const before = await sample();
  const started = Date.now();
  await delay(4500);
  await host.until(`qa.tag('audio').currentTime>${before.time + 2}&&qa.tag('audio').readyState>=2`, 30000);
  const after = await sample();
  assert(after.time > before.time + 2, `${title}: playback did not advance`);
  assert(after.buffered.some(([start, end]) => start <= after.time && end > after.time), 'Current audio is not buffered');
  assert.equal(after.error, null);
  return { before, after, observedMs: Date.now() - started };
};
const launch = async profile => {
  const port = await freePort();
  logs = '';
  processHandle = spawn(executable, ['--profile', profile], { windowsHide: true, env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` }, stdio: ['ignore', 'pipe', 'pipe'] });
  processHandle.stdout.on('data', data => { logs += data; });
  processHandle.stderr.on('data', data => { logs += data; });
  host = await connect(port, item => item.type === 'page' && /tauri\.localhost|tauri:/.test(item.url));
  protectQaWindow(processHandle.pid);
  await host.until("Boolean(qa.testId('search-box'))");
};
const close = async () => {
  if (host) {
    try { await host.send('Runtime.evaluate', { expression: "void window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})" }); } catch {}
    host.close(); host = undefined;
  }
  if (processHandle) {
    for (let attempt = 0; attempt < 30 && processHandle.exitCode === null; attempt++) await delay(250);
    if (processHandle.exitCode === null) processHandle.kill();
    processHandle = undefined;
  }
};

try {
  const profile = `qa-music-${Date.now()}`;
  const migration = JSON.parse(execFileSync('python', [path.join(root, '_scripts/migrate-profile.py'), '--profile', profile], { encoding: 'utf8' }));
  checkpoint('isolatedProfile', migration);
  const settingsFile = path.join(migration.profile, 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  Object.assign(settings, { 'core.playback.repeat': 'off', 'core.playback.shuffle': false, 'core.playback.discovery': false, 'core.playback.muted': false, 'core.playback.volume': 0.14 });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  const queueFile = path.join(migration.profile, 'queue.json');
  const queue = fs.existsSync(queueFile) ? JSON.parse(fs.readFileSync(queueFile, 'utf8')) : {};
  const playlists = fs.readdirSync(path.join(migration.profile, 'playlists')).filter(name => name !== 'index.json' && name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(migration.profile, 'playlists', name), 'utf8')).playlist);
  const libraryTracks = playlists.flatMap(playlist => playlist.items).map(item => item.track);
  const firstTrack = queue['queue.items']?.[0]?.track || libraryTracks[0];
  const secondTrack = libraryTracks.find(track => track.source.id !== firstTrack?.source.id);
  assert(firstTrack && secondTrack, 'The read-only migrated library must contain two distinct supported tracks for this smoke test');
  const tracks = [firstTrack, secondTrack].map(track => { const { streamCandidates, selectedStream, ...metadata } = track; return metadata; });
  fs.writeFileSync(path.join(migration.profile, 'queue.json'), JSON.stringify({ 'queue.items': tracks.map(track => ({ id: randomUUID(), track, status: 'idle', addedAtIso: new Date().toISOString() })), 'queue.currentIndex': 0 }, null, 2));
  await launch(profile);
  if (await host.evaluate("Boolean(qa.role('dialog')?.textContent.includes('Your media, your way'))")) await clickText('Use the defaults');
  await host.until("!qa.role('dialog')");
  await host.evaluate("qa.testId('player-play-button')?.click()");
  checkpoint('firstTrack', await waitPlaying(tracks[0].title));
  await host.evaluate("qa.testId('player-pause-button').click()");
  await host.until("qa.tag('audio').paused");
  const pausedAt = await sample();
  await delay(1800);
  const stillPaused = await sample();
  assert(Math.abs(stillPaused.time - pausedAt.time) < 0.1, 'Paused audio continued advancing');
  checkpoint('pause', { pausedAt, stillPaused });
  await host.evaluate("qa.testId('player-play-button').click()");
  checkpoint('resume', await waitPlaying(tracks[0].title));
  const targetTime = await host.evaluate("qa.tag('audio').duration*0.45");
  const seekBounds = await host.evaluate("(()=>{const box=qa.testId('player-seek-bar').getBoundingClientRect();return {x:box.x+box.width*0.45,y:box.y+box.height/2}})()");
  await host.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...seekBounds, button: 'left', clickCount: 1 });
  await host.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...seekBounds, button: 'left', clickCount: 1 });
  await host.until(`Math.abs(qa.tag('audio').currentTime-${targetTime})<5`, 15000);
  checkpoint('seek', { targetTime, playback: await waitPlaying(tracks[0].title) });
  await host.evaluate("qa.testId('player-volume-slider').getElementsByTagName('input')[0].focus()");
  await press('Home', 'Home', 36);
  await host.until("qa.tag('audio').volume===0");
  for (let step = 0; step < 3; step++) await press('PageUp', 'PageUp', 33);
  await host.until("Math.abs(qa.tag('audio').volume-0.3)<0.01");
  checkpoint('volume', await sample());
  const muteBefore = await host.evaluate("qa.testId('player-volume-slider').parentElement.getElementsByTagName('button')[0].outerHTML");
  await host.evaluate("qa.testId('player-volume-slider').parentElement.getElementsByTagName('button')[0].click()");
  await delay(400);
  checkpoint('muteButton', { markup: muteBefore, state: await sample(), works: await host.evaluate("qa.tag('audio').volume===0") });
  if (report.checks.muteButton.works) {
    await host.evaluate("qa.testId('player-volume-slider').parentElement.getElementsByTagName('button')[0].click()");
    await host.until("Math.abs(qa.tag('audio').volume-0.3)<0.01");
    checkpoint('unmute', await sample());
  }
  await host.evaluate("qa.testId('player-next-button').click()");
  checkpoint('nextTrack', await waitPlaying(tracks[1].title));
  await host.evaluate("qa.testId('player-play-button')?.click();qa.testId('player-pause-button').previousElementSibling.click()");
  checkpoint('previousTrack', await waitPlaying(tracks[0].title));
  await screenshot('music-playback.png');
  checkpoint('playbackConsole', { exceptions: host.exceptions, errors: host.errors });
  fs.writeFileSync(path.join(output, 'music-playback.log'), logs);
  await close();

  const freshProfile = `qa-music-fresh-${Date.now()}`;
  await launch(freshProfile);
  await host.until("qa.role('dialog')?.textContent.includes('Your media, your way')");
  await clickText('Use the defaults');
  await host.until("!qa.role('dialog')");
  await host.evaluate("qa.link('/sources').click()");
  await host.until("qa.testId('sources-section-metadata')?.getElementsByTagName('button')[0]?.textContent.trim()==='Spotify'&&qa.testId('sources-section-streaming')?.getElementsByTagName('button')[0]?.textContent.trim()==='YouTube'", 120000);
  checkpoint('freshDefaultSources', await host.evaluate("({metadata:qa.testId('sources-section-metadata').innerText,streaming:qa.testId('sources-section-streaming').innerText})"));
  await screenshot('music-default-sources.png');
  await host.evaluate("(()=>{const input=qa.testId('search-box');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Daft Punk Get Lucky');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await press('Enter', 'Enter', 13);
  await host.until("location.pathname==='/search'", 10000);
  await clickText('Tracks');
  await host.until("Boolean(qa.testId('track-row'))", 45000);
  checkpoint('freshSpotifyTracks', await host.evaluate("[...document.getElementsByTagName('*')].filter(element=>element.dataset.testid==='track-row').slice(0,3).map(element=>element.innerText)"));
  await host.evaluate("qa.testId('play-all-button').click()");
  await host.until("qa.testId('now-playing-title')?.textContent&&qa.testId('now-playing-title').textContent!=='No track playing'", 10000);
  const spotifyTrackTitle = await host.evaluate("qa.testId('now-playing-title').textContent");
  checkpoint('freshSpotifyYouTubePlayback', await waitPlaying(spotifyTrackTitle));
  await screenshot('music-default-playback.png');
  await host.evaluate("qa.testId('player-pause-button').click()");
  await clickText('Preferences');
  await host.until("Boolean(qa.role('dialog'))");
  await host.evaluate("[...qa.testId('settings-navigation-section-app').getElementsByTagName('button')].find(element=>element.textContent.trim()==='Plugins').click()");
  await clickText('Store');
  await host.until("Boolean(qa.testId('plugin-store-item'))", 45000);
  checkpoint('freshStore', await host.evaluate("qa.withPrefix('data-testid','plugin-store-item-name').map(element=>element.textContent)"));
  await screenshot('music-fresh-plugin-store.png');
  await host.evaluate("(()=>{const item=[...document.getElementsByTagName('*')].find(element=>element.dataset.testid==='plugin-store-item'&&element.textContent.includes('Bandcamp'));if(!item)throw Error('Bandcamp not in catalog');[...item.getElementsByTagName('button')].find(button=>button.textContent.trim()==='Install').click()})()");
  await host.until("[...document.getElementsByTagName('*')].some(element=>element.dataset.testid==='plugin-store-item'&&element.textContent.includes('Bandcamp')&&[...element.getElementsByTagName('button')].some(button=>button.textContent.trim()==='Installed'))", 90000);
  checkpoint('freshInstalled', await host.evaluate("[...document.getElementsByTagName('*')].find(element=>element.dataset.testid==='plugin-store-item'&&element.textContent.includes('Bandcamp')).innerText"));
  await press('Escape', 'Escape', 27);
  await host.until("!qa.role('dialog')");
  await host.evaluate("qa.link('/sources').click()");
  await host.until("Boolean(qa.testId('sources-section-metadata'))");
  await host.evaluate("qa.testId('sources-section-metadata').getElementsByTagName('button')[0].click()");
  await host.until("(()=>{const option=[...document.getElementsByTagName('*')].find(element=>element.getAttribute('role')==='option'&&element.textContent.trim()==='Bandcamp');if(!option)return false;option.click();return true})()");
  await host.until("qa.testId('sources-section-metadata').getElementsByTagName('button')[0].textContent.trim()==='Bandcamp'");
  await host.evaluate("(()=>{const input=qa.testId('search-box');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'HOME Resonance');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await press('Enter', 'Enter', 13);
  await host.until("location.pathname==='/search'", 10000);
  await delay(10000);
  checkpoint('freshSearch', await host.evaluate("({path:location.pathname,text:qa.tag('main')?.innerText||document.body.innerText})"));
  await clickText('Tracks');
  await host.until("Boolean(qa.testId('track-row'))", 15000);
  checkpoint('freshTracks', await host.evaluate("[...document.getElementsByTagName('*')].filter(element=>element.dataset.testid==='track-row').slice(0,3).map(element=>element.innerText)"));
  await host.evaluate("qa.testId('play-all-button').click()");
  await host.until(`qa.testId('now-playing-title')?.textContent&&qa.testId('now-playing-title').textContent!=='No track playing'&&qa.testId('now-playing-title').textContent!==${JSON.stringify(spotifyTrackTitle)}`, 10000);
  const freshTrackTitle = await host.evaluate("qa.testId('now-playing-title').textContent");
  checkpoint('freshPlayback', await waitPlaying(freshTrackTitle));
  await screenshot('music-fresh-search.png');
  checkpoint('freshConsole', { exceptions: host.exceptions, errors: host.errors });
  fs.writeFileSync(path.join(output, 'music-fresh.log'), logs);
  assert(report.checks.muteButton.works, 'The music volume button did not mute playback');
  report.success = true;
} catch (error) {
  report.errors.push({ message: error.message, stack: error.stack });
  if (host) {
    try { report.failureState = await sample(); report.failureText = await host.evaluate('document.body.innerText'); await screenshot('music-smoke-failure.png'); } catch {}
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  save();
  fs.writeFileSync(path.join(output, 'music-smoke-last.log'), logs);
  await close();
  console.log('Music report:', path.join(output, 'music-smoke-report.json'));
}
