import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRendererAssets, validateRendererDirectory } from '../engines/cartertube/_scripts/validateRendererAssets.mjs';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'engines', 'cartertube');

export const verifyEngineArchive = async (archive, compareSource = false) => {
  const builderRequire = createRequire(realpathSync(path.join(engineRoot, 'node_modules', 'electron-builder', 'package.json')));
  const asar = createRequire(builderRequire.resolve('app-builder-lib'))('@electron/asar');
  const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/').replace(/^\//, ''))
    .filter(file => file.startsWith('dist/') && !asar.statFile(archive, path.normalize(file)).files)
    .map(file => file.slice('dist/'.length));
  const readAsset = file => asar.extractFile(archive, path.join('dist', file));
  const references = await validateRendererAssets(files, async file => readAsset(file).toString('utf8'));
  if (compareSource) {
    for (const file of references) {
      if (!(await readFile(path.join(engineRoot, 'dist', file))).equals(readAsset(file))) {
        throw new Error(`The packaged video engine contains an older ${file}. Repackage the engine before using --skip-engine.`);
      }
    }
  }
  process.stdout.write('Validated video renderer styles, fonts, entry points, and the main-process asset allowlist.\n');
};

export const verifyEngineSource = () => validateRendererDirectory(path.join(engineRoot, 'dist'));
