import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const createWindowsInputTest = () => {
  assert.equal(process.platform, 'win32', 'OS input QA requires Windows.');
  assert.equal(
    process.env.GITHUB_ACTIONS,
    'true',
    'OS input QA requires GitHub Actions.',
  );
  assert.equal(
    process.env.RUNNER_OS,
    'Windows',
    'OS input QA requires a Windows runner.',
  );
  assert.equal(
    process.env.RUNNER_ENVIRONMENT,
    'github-hosted',
    'OS input QA requires an isolated GitHub-hosted runner.',
  );
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      fileURLToPath(new URL('./windows-input-test.ps1', import.meta.url)),
    ],
    {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const pending = new Map();
  let nextId = 0;
  let errors = '';
  let finished = false;
  const failPending = (error) => {
    for (const handler of pending.values()) {
      handler.reject(error);
    }
    pending.clear();
  };
  child.stderr.on('data', (data) => {
    errors = (errors + data).slice(-4000);
  });
  child.on('error', (error) => {
    finished = true;
    failPending(error);
  });
  child.stdin.on('error', failPending);
  const completion = new Promise((resolve) =>
    child.once('close', (code, signal) => {
      finished = true;
      failPending(
        new Error(
          `Windows OS input helper exited (${code ?? signal}): ${errors}`,
        ),
      );
      resolve();
    }),
  );
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      failPending(
        new Error(`Invalid Windows OS input response: ${line.slice(0, 300)}`),
      );
      return;
    }
    const handler = pending.get(response.id);
    if (!handler) {
      return;
    }
    pending.delete(response.id);
    if (response.error) {
      handler.reject(new Error(response.error));
    } else {
      handler.resolve(response.result);
    }
  });
  const send = (action, parameters = {}) =>
    new Promise((resolve, reject) => {
      if (finished) {
        reject(new Error(`The Windows OS input helper is closed: ${errors}`));
        return;
      }
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Windows OS input helper timed out: ${action}`));
      }, 20000);
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(
        `${JSON.stringify({ ...parameters, id, action })}\n`,
        (error) => {
          if (!error) {
            return;
          }
          const handler = pending.get(id);
          pending.delete(id);
          handler?.reject(error);
        },
      );
    });
  const close = async () => {
    child.stdin.end();
    let timer;
    try {
      await Promise.race([
        completion,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 5000);
        }),
      ]);
      if (!finished) {
        child.kill();
      }
    } finally {
      clearTimeout(timer);
      lines.close();
    }
  };
  return { send, close };
};
