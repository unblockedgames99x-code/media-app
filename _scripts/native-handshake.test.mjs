import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { monitorNativeHandshake } from './native-handshake.mjs';

const filename = 'handshake-12345678-1234-1234-1234-123456789abc.json';
const handshake = { pid: 123, port: 49321, hwnd: '' };

const fixture = async t => {
  const parent = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(parent, 'media-handshake-'));
  assert.equal(path.dirname(directory), parent);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test('observes completed renderer initialization before native consumes its handshake', async t => {
  const directory = await fixture(t);
  const readiness = monitorNativeHandshake(directory, async value => assert.deepEqual(value, handshake));
  t.after(readiness.close);
  const temporary = path.join(directory, `${filename}.123.tmp`);
  await writeFile(temporary, '');
  await delay(15);
  await writeFile(temporary, JSON.stringify(handshake));
  await delay(15);
  await rename(temporary, path.join(directory, filename));
  await unlink(path.join(directory, filename));
  assert.deepEqual(await readiness.ready, { pid: 123, port: 49321, observedFrom: 'completed-temporary-file' });
});

test('validates published native PID and port before permitting debugger attachment', async t => {
  const directory = await fixture(t);
  let validated = false;
  const readiness = monitorNativeHandshake(directory, async value => {
    await delay(15);
    assert.equal(value.pid, 123);
    validated = true;
  });
  t.after(readiness.close);
  await writeFile(path.join(directory, filename), JSON.stringify(handshake));
  assert.equal((await readiness.ready).observedFrom, 'published-file');
  assert.equal(validated, true);
});

test('captures rapid atomic publish and removal without adding a startup sleep', async t => {
  const directory = await fixture(t);
  for (let index = 0; index < 10; index++) {
    const next = path.join(directory, String(index));
    await mkdir(next);
    const readiness = monitorNativeHandshake(next, async value => assert.deepEqual(value, handshake), 1000);
    t.after(readiness.close);
    const temporary = path.join(next, `${filename}.123.tmp`);
    await writeFile(temporary, JSON.stringify(handshake));
    await rename(temporary, path.join(next, filename));
    await unlink(path.join(next, filename));
    assert.equal((await readiness.ready).pid, 123);
  }
});

test('rejects unrelated process ownership and invalid handshake data', async t => {
  const directory = await fixture(t);
  const readiness = monitorNativeHandshake(directory, async () => { throw new Error('Wrong executable or parent process'); });
  t.after(readiness.close);
  await writeFile(path.join(directory, filename), JSON.stringify(handshake));
  await assert.rejects(readiness.ready, /Wrong executable or parent process/);
  const next = path.join(directory, 'invalid');
  await mkdir(next);
  const invalid = monitorNativeHandshake(next, async () => assert.fail('Invalid input must not reach process validation'));
  t.after(invalid.close);
  await writeFile(path.join(next, filename), JSON.stringify({ pid: 1, port: 49321, hwnd: '' }));
  await assert.rejects(invalid.ready, /handshake is invalid/);
});

test('bounded readiness and explicit cancellation close the file watcher', async t => {
  const directory = await fixture(t);
  const bounded = monitorNativeHandshake(directory, async () => assert.fail('No handshake should be validated'), 30);
  await assert.rejects(bounded.ready, /readiness deadline/);
  const stopped = monitorNativeHandshake(directory, async () => assert.fail('Stopped watcher must not validate'));
  stopped.close();
  await assert.rejects(stopped.ready, /observation stopped/);
  await writeFile(path.join(directory, filename), JSON.stringify(handshake));
  await delay(20);
});
