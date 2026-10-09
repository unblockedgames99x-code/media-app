import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const writeChecksums = async (directory) => {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:zip|exe|AppImage|deb|dmg)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const checksums = [];
  for (const name of entries) {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path.join(directory, name))) digest.update(chunk);
    checksums.push(`${digest.digest('hex')}  ${name}`);
  }
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
  return checksums;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2] ?? 'build/releases');
  const checksums = await writeChecksums(directory);
  process.stdout.write(`Wrote ${checksums.length} checksums to ${path.join(directory, 'SHA256SUMS.txt')}\n`);
}
