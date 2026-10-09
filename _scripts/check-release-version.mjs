import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const application = JSON.parse(await readFile(path.join(root, 'packages/player/package.json'), 'utf8'));
const configuration = JSON.parse(await readFile(path.join(root, 'packages/player/src-tauri/tauri.conf.json'), 'utf8'));
if (application.version !== configuration.version) throw new Error('Application versions disagree. Run pnpm media:prepare X.Y.Z.');
if (process.env.GITHUB_REF?.startsWith('refs/tags/') && process.env.GITHUB_REF_NAME !== `v${configuration.version}`) {
  throw new Error('The release tag must match the application version.');
}
process.stdout.write(`Application version: ${configuration.version}\n`);
