import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { writeChecksums } from './checksums.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot = path.join(root, 'engines', 'cartertube');
const playerRoot = path.join(root, 'packages', 'player');
const tauriRoot = path.join(playerRoot, 'src-tauri');
const { values } = parseArgs({
  options: {
    arch: { type: 'string', default: process.arch },
    target: { type: 'string' },
    'skip-engine': { type: 'boolean', default: false },
    'no-bundle': { type: 'boolean', default: false },
    plan: { type: 'boolean', default: false },
  },
});
const platform = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform];
if (!platform || !['x64', 'arm64'].includes(values.arch)) {
  throw new Error('Build on Windows, Linux, or macOS using --arch x64 or --arch arm64.');
}
if (platform !== 'macos' && values.arch !== process.arch) {
  throw new Error('Build Windows and Linux on a runner matching the requested architecture.');
}
const expectedTarget = {
  windows: { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' },
  linux: { x64: 'x86_64-unknown-linux-gnu', arm64: 'aarch64-unknown-linux-gnu' },
  macos: { x64: 'x86_64-apple-darwin', arm64: 'aarch64-apple-darwin' },
}[platform][values.arch];
if (values.target && values.target !== expectedTarget) {
  throw new Error(`The requested platform and architecture require --target ${expectedTarget}.`);
}
const target = values.target ?? expectedTarget;
const explicitTarget = Boolean(values.target) || values.arch !== process.arch;
const configuration = JSON.parse(await readFile(path.join(tauriRoot, 'tauri.conf.json'), 'utf8'));
const version = configuration.version;
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
  throw new Error('The release version must be a semantic version.');
}
const engineOutput = path.join(engineRoot, 'build', 'portable', `${platform}-${values.arch}`);
const unpackedFolder = {
  windows: values.arch === 'x64' ? 'win-unpacked' : 'win-arm64-unpacked',
  linux: values.arch === 'x64' ? 'linux-unpacked' : 'linux-arm64-unpacked',
  macos: values.arch === 'x64' ? 'mac' : 'mac-arm64',
}[platform];
const unpackedEngine = path.join(engineOutput, unpackedFolder);
const engineExecutable = path.join(unpackedEngine, ...{
  windows: ['media-video.exe'],
  linux: ['media-video'],
  macos: ['Media Video.app', 'Contents', 'MacOS', 'media-video'],
}[platform]);
const releaseDirectory = path.join(root, 'build', 'releases');
const bundleTargets = { windows: 'nsis', linux: 'appimage,deb', macos: 'app,dmg' }[platform];
const overlay = {
  productName: 'Media',
  mainBinaryName: 'Media',
  build: { beforeBuildCommand: '' },
  bundle: {
    createUpdaterArtifacts: false,
    resources: {
      [`${unpackedEngine.replaceAll('\\', '/')}/`]: 'video-engine/',
      [path.join(root, 'LICENSE').replaceAll('\\', '/')]: 'licenses/LICENSE-Nuclear.txt',
      [path.join(engineRoot, 'LICENSE').replaceAll('\\', '/')]: 'licenses/LICENSE-FreeTube.txt',
      [`${path.join(root, 'licenses').replaceAll('\\', '/')}/`]: 'licenses/fonts/',
      [path.join(root, 'README.md').replaceAll('\\', '/')]: 'README.md',
    },
    linux: {
      appimage: { bundleMediaFramework: true },
      deb: {
        depends: [
          'libwebkit2gtk-4.1-0', 'libgtk-3-0', 'libnss3', 'libxss1',
          'libxtst6', 'libatspi2.0-0', 'libsecret-1-0', 'libnotify4',
          'libasound2 | libasound2t64', 'libgbm1', 'libdrm2', 'xdg-utils',
          'gstreamer1.0-plugins-base', 'gstreamer1.0-plugins-good', 'gstreamer1.0-libav',
        ],
      },
    },
  },
};
if (platform === 'macos') {
  delete overlay.bundle.resources[`${unpackedEngine.replaceAll('\\', '/')}/`];
  overlay.bundle.macOS = {
    minimumSystemVersion: '13.0',
    files: {
      'Resources/video-engine/Media Video.app': path.join(unpackedEngine, 'Media Video.app').replaceAll('\\', '/'),
    },
  };
}

const plan = { platform, arch: values.arch, target, version, engineExecutable, bundleTargets, releaseDirectory, overlay };
if (values.plan) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

const run = (executable, args, cwd, environment = {}) => {
  const result = spawnSync(executable, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(executable)} exited with status ${result.status}.`);
};

const pnpm = (args, cwd) => {
  if (process.env.npm_execpath?.match(/pnpm\.(?:c?js|mjs)$/)) {
    run(process.execPath, [process.env.npm_execpath, ...args], cwd);
    return;
  }
  if (process.platform === 'win32') {
    const quoted = args.map((argument) => {
      if (/["%\r\n!&|<>^]/.test(argument)) throw new Error('Invalid build argument.');
      return `"${argument}"`;
    });
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `pnpm ${quoted.join(' ')}`], cwd);
    return;
  }
  run('pnpm', args, cwd);
};

if (!values['skip-engine']) {
  pnpm(['run', 'pack'], engineRoot);
  run(process.execPath, [
    path.join(engineRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'),
    '--config', '_scripts/portable.config.mjs',
    `--${{ windows: 'win', linux: 'linux', macos: 'mac' }[platform]}`,
    `--${values.arch}`, '--dir', '--publish', 'never',
  ], engineRoot, { MEDIA_BUILD_PLATFORM: platform, MEDIA_BUILD_ARCH: values.arch, CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
}
await stat(engineExecutable);
if (platform !== 'windows' && ((await stat(engineExecutable)).mode & 0o111) === 0) {
  throw new Error('The video engine is missing its executable file permissions.');
}

pnpm(['exec', 'turbo', 'run', 'build:frontend', '--filter=@nuclearplayer/player'], root);
const overlayPath = path.join(tauriRoot, 'tauri.media.generated.json');
await writeFile(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
const tauriArguments = [
  path.join(playerRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
  'build', '--config', overlayPath,
  ...(explicitTarget ? ['--target', target] : []),
  '--no-bundle',
];
run(process.execPath, tauriArguments, playerRoot, { CSC_IDENTITY_AUTO_DISCOVERY: 'false' });

await mkdir(releaseDirectory, { recursive: true });
const nativeRelease = path.join(tauriRoot, 'target', ...(explicitTarget ? [target] : []), 'release');
const releasePrefix = `Media-${version}-${platform}-${values.arch}`;
let portableDirectory;
if (platform === 'windows') {
  const portable = path.join(root, 'build', `${releasePrefix}-portable`);
  portableDirectory = portable;
  await mkdir(portable, { recursive: true });
  await cp(path.join(nativeRelease, 'Media.exe'), path.join(portable, 'Media.exe'));
  await cp(unpackedEngine, path.join(portable, 'video-engine'), { recursive: true, force: true });
  await cp(path.join(root, 'README.md'), path.join(portable, 'README.md'));
  await cp(path.join(root, 'licenses'), path.join(portable, 'licenses'), { recursive: true, force: true });
  await cp(path.join(root, 'LICENSE'), path.join(portable, 'licenses', 'LICENSE-Nuclear.txt'));
  await cp(path.join(engineRoot, 'LICENSE'), path.join(portable, 'licenses', 'LICENSE-FreeTube.txt'));
  await writeFile(path.join(portable, 'BUILD.json'), `${JSON.stringify({ version, platform, arch: values.arch, target }, null, 2)}\n`);
  process.stdout.write(`\nPORTABLE_APP_READY ${path.join(portable, 'Media.exe')}\n`);
}

if (!values['no-bundle']) {
  run(process.execPath, [
    path.join(playerRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'bundle', '--config', overlayPath, '--bundles', bundleTargets,
    ...(explicitTarget ? ['--target', target] : []),
  ], playerRoot, { CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
}
if (portableDirectory) {
  run('powershell.exe', [
    '-NoProfile', '-File', path.join(root, '_scripts', 'archive-windows.ps1'),
    '-Source', portableDirectory, '-Output', path.join(releaseDirectory, `${releasePrefix}-portable.zip`),
  ], root);
}

const collectBundles = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.endsWith('.app')) await collectBundles(entryPath);
      continue;
    }
    const extension = ['.exe', '.AppImage', '.deb', '.dmg'].find((candidate) => entry.name.endsWith(candidate));
    if (extension && (extension !== '.exe' || entry.name.endsWith('-setup.exe'))) {
      const suffix = extension === '.exe' ? '-setup.exe' : extension;
      await cp(entryPath, path.join(releaseDirectory, `${releasePrefix}${suffix}`));
    }
  }
};
if (!values['no-bundle']) await collectBundles(path.join(nativeRelease, 'bundle'));
await writeChecksums(releaseDirectory);
process.stdout.write(`\nRelease files are ready in ${releaseDirectory}\n`);
