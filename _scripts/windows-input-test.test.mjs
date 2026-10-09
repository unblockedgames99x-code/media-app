import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWindowsInputTest } from './windows-input-test.mjs';

const runnerEnvironment = (context, values) => {
  for (const [name, value] of Object.entries(values)) {
    const original = process.env[name];
    context.after(() => {
      if (original === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = original;
      }
    });
    process.env[name] = value;
  }
};

test(
  'refuses OS input outside GitHub Actions before creating a driver',
  { skip: process.platform !== 'win32' },
  (context) => {
    runnerEnvironment(context, { GITHUB_ACTIONS: 'false' });
    assert.throws(
      createWindowsInputTest,
      /OS input QA requires GitHub Actions/,
    );
  },
);

test(
  'refuses an unverified runner operating system before creating a driver',
  { skip: process.platform !== 'win32' },
  (context) => {
    runnerEnvironment(context, { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux' });
    assert.throws(
      createWindowsInputTest,
      /OS input QA requires a Windows runner/,
    );
  },
);

test(
  'refuses self-hosted desktop input before creating a driver',
  { skip: process.platform !== 'win32' },
  (context) => {
    runnerEnvironment(context, {
      GITHUB_ACTIONS: 'true',
      RUNNER_OS: 'Windows',
      RUNNER_ENVIRONMENT: 'self-hosted',
    });
    assert.throws(
      createWindowsInputTest,
      /OS input QA requires an isolated GitHub-hosted runner/,
    );
  },
);

test(
  'refuses OS input on other operating systems',
  { skip: process.platform === 'win32' },
  () => {
    assert.throws(createWindowsInputTest, /OS input QA requires Windows/);
  },
);
