import { spawnSync } from 'node:child_process';
import { access, lstat, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { arch: { type: 'string', default: process.arch }, target: { type: 'string' } } });
const platform = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform];
if (!platform || !['x64', 'arm64'].includes(values.arch)) throw new Error('Unsupported release platform or architecture.');
const defaultTarget = {
  windows: { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' },
  linux: { x64: 'x86_64-unknown-linux-gnu', arm64: 'aarch64-unknown-linux-gnu' },
  macos: { x64: 'x86_64-apple-darwin', arm64: 'aarch64-apple-darwin' },
}[platform][values.arch];
if (values.target && values.target !== defaultTarget) throw new Error('Target does not match release platform and architecture.');
const explicitTarget = Boolean(values.target) || values.arch !== process.arch;
const nativeRelease = path.join(root, 'packages', 'player', 'src-tauri', 'target', ...(explicitTarget ? [defaultTarget] : []), 'release');
const releaseDirectory = path.join(root, 'build', 'releases');
const releases = await readdir(releaseDirectory);
const configuration = JSON.parse(await readFile(path.join(root, 'packages', 'player', 'src-tauri', 'tauri.conf.json'), 'utf8'));
let extractedResources;
if (platform === 'linux') {
  const appImage = releases.find((name) => name.includes(`-${platform}-${values.arch}`) && name.endsWith('.AppImage'));
  if (!appImage) throw new Error('The Linux AppImage is missing.');
  const verificationDirectory = path.join(root, 'build', 'verify', `${platform}-${values.arch}`);
  await mkdir(verificationDirectory, { recursive: true });
  const extraction = spawnSync(path.join(releaseDirectory, appImage), ['--appimage-extract'], {
    cwd: verificationDirectory,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error(`AppImage extraction failed: ${extraction.stderr}`);
  extractedResources = path.join(verificationDirectory, 'squashfs-root', 'usr', 'lib', 'Media', 'video-engine');
}
const candidates = {
  windows: [path.join(root, 'build', `Media-${configuration.version}-windows-${values.arch}-portable`, 'video-engine')],
  linux: [
    extractedResources,
    path.join(nativeRelease, 'bundle', 'appimage', 'Media.AppDir', 'usr', 'lib', 'Media', 'video-engine'),
    path.join(nativeRelease, 'video-engine'),
  ],
  macos: [path.join(nativeRelease, 'bundle', 'macos', 'Media.app', 'Contents', 'Resources', 'video-engine')],
}[platform];
let resourceDirectory;
for (const candidate of candidates) {
  try {
    if ((await stat(candidate)).isDirectory()) {
      resourceDirectory = candidate;
      break;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
if (!resourceDirectory) throw new Error(`The packaged video runtime is missing. Checked ${candidates.join(', ')}.`);
const engineExecutable = path.join(resourceDirectory, ...{
  windows: ['media-video.exe'],
  linux: ['media-video'],
  macos: ['Media Video.app', 'Contents', 'MacOS', 'media-video'],
}[platform]);
const executableDetails = await stat(engineExecutable);
if (!executableDetails.isFile()) throw new Error('The video executable is missing.');
if (platform !== 'windows' && (executableDetails.mode & 0o111) === 0) throw new Error('The video executable lost its executable permissions.');
const asarPath = platform === 'macos'
  ? path.join(resourceDirectory, 'Media Video.app', 'Contents', 'Resources', 'app.asar')
  : path.join(resourceDirectory, 'resources', 'app.asar');
await access(asarPath);
if (platform === 'macos') {
  const framework = path.join(resourceDirectory, 'Media Video.app', 'Contents', 'Frameworks', 'Electron Framework.framework');
  if (!(await lstat(path.join(framework, 'Versions', 'Current'))).isSymbolicLink()) {
    throw new Error('The Electron framework version link was not preserved.');
  }
  await access(path.join(framework, 'Electron Framework'));
  await access(path.join(framework, 'Resources'));
  const applicationBundle = path.join(nativeRelease, 'bundle', 'macos', 'Media.app');
  const signature = spawnSync('codesign', ['--verify', '--deep', '--strict', applicationBundle], { encoding: 'utf8' });
  if (signature.error) throw signature.error;
  if (signature.status !== 0) throw new Error(`The bundled macOS signatures are invalid: ${signature.stderr}`);
}
const required = { windows: ['-setup.exe', '-portable.zip'], linux: ['.AppImage', '.deb'], macos: ['.dmg'] }[platform];
for (const extension of required) {
  if (!releases.some((name) => name.includes(`-${platform}-${values.arch}`) && name.endsWith(extension))) {
    throw new Error(`Missing ${platform} ${values.arch} release: ${extension}.`);
  }
}
await access(path.join(releaseDirectory, 'SHA256SUMS.txt'));
process.stdout.write(`Validated ${platform} ${values.arch}: packaged video runtime, permissions, application archive, release files, and checksums.\n`);
