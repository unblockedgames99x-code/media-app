import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const runPnpm = (args, cwd) => {
  const options = { cwd, stdio: 'inherit', env: process.env };
  const launcher = process.env.npm_execpath;
  let result;
  if (launcher && /\.(?:c?js|mjs)$/i.test(launcher)) {
    result = spawnSync(process.execPath, [launcher, ...args], options);
  } else if (launcher && /\.exe$/i.test(launcher)) {
    result = spawnSync(launcher, args, options);
  } else if (process.platform === 'win32') {
    if (args.some((argument) => !/^[a-zA-Z0-9@_./:=+-]+$/.test(argument))) {
      throw new Error('Unsupported Windows build argument.');
    }
    result = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], {
      ...options,
      windowsVerbatimArguments: true,
    });
  } else {
    result = spawnSync('pnpm', args, options);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm exited with status ${result.status}.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPnpm(process.argv.slice(2), process.cwd());
}
