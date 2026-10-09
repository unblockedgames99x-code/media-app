import { watch } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import path from 'node:path';

export const monitorNativeHandshake = (directory, validate, timeout = 60000) => {
  let finished = false;
  let watcher;
  let poll;
  let deadline;
  let resolveReady;
  let rejectReady;
  const reading = new Set();
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});
  const stop = () => {
    finished = true;
    watcher?.close();
    clearInterval(poll);
    clearTimeout(deadline);
  };
  const fail = error => {
    if (finished) return;
    stop();
    rejectReady(error);
  };
  const inspect = async name => {
    if (finished || reading.has(name) || !/^handshake-[0-9a-f-]{36}\.json(?:\.\d+\.tmp)?$/.test(name)) return;
    reading.add(name);
    let handle;
    try {
      handle = await open(path.join(directory, name), 'r');
      const buffer = Buffer.alloc(4097);
      const readDeadline = Date.now() + 1000;
      while (!finished && Date.now() < readDeadline) {
        const { bytesRead } = await handle.read({ buffer, offset: 0, length: buffer.length, position: 0 });
        if (bytesRead > 4096) throw new Error('The native video handshake exceeds the allowed size.');
        let handshake;
        try {
          handshake = JSON.parse(buffer.subarray(0, bytesRead).toString());
        } catch {
          await new Promise(resolve => setTimeout(resolve, 5));
          continue;
        }
        if (!handshake || !Number.isSafeInteger(handshake.pid) || handshake.pid <= 1 ||
            !Number.isSafeInteger(handshake.port) || handshake.port < 1 || handshake.port > 65535 ||
            typeof handshake.hwnd !== 'string') {
          throw new Error('The native video handshake is invalid.');
        }
        await validate(handshake);
        if (!finished) {
          stop();
          resolveReady({ pid: handshake.pid, port: handshake.port, observedFrom: name.endsWith('.tmp') ? 'completed-temporary-file' : 'published-file' });
        }
        return;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') fail(error);
    } finally {
      await handle?.close();
      reading.delete(name);
    }
  };
  const scan = async () => {
    if (finished) return;
    try {
      for (const name of await readdir(directory)) void inspect(name);
    } catch (error) {
      fail(error);
    }
  };
  watcher = watch(directory, (_event, filename) => {
    if (filename) void inspect(String(filename));
  });
  watcher.on('error', fail);
  poll = setInterval(() => { void scan(); }, 10);
  deadline = setTimeout(() => fail(new Error('The packaged app did not complete native video initialization before the 60-second readiness deadline.')), timeout);
  void scan();
  return {
    ready,
    close: () => {
      if (!finished) {
        stop();
        rejectReady(new Error('Native video readiness observation stopped.'));
      }
    },
  };
};
