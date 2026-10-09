import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
  throw new Error('Usage: pnpm media:prepare X.Y.Z');
}
for (const file of ['packages/player/package.json', 'packages/player/src-tauri/tauri.conf.json']) {
  const filename = path.join(root, file);
  const configuration = JSON.parse(await readFile(filename, 'utf8'));
  configuration.version = version;
  await writeFile(filename, `${JSON.stringify(configuration, null, 2)}\n`);
}
process.stdout.write(`Prepared Media ${version}. Review the changes, commit them, then create and push tag v${version}.\n`);
