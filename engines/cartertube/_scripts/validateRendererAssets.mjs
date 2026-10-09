import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export const validateRendererAssets = async (files, readText) => {
  const main = await readText('main.js')
  const allowlists = [...main.matchAll(/new Set\((\[\s*"\/[^\]]+\])\)/g)]
    .map(match => JSON.parse(match[1]))
  const allowlist = allowlists.find(paths => paths.includes('/index.html') && paths.includes('/renderer.js'))
  if (!allowlist) throw new Error('The video renderer asset allowlist is missing. Run the complete engine pack command.')
  const allowed = new Set(allowlist)
  const available = new Set(files.map(file => `/${file}`))
  const excluded = new Set(['main.js', 'main.js.LICENSE.txt', 'preload.js', 'botGuardScript.js'])
  for (const file of files) {
    if (!excluded.has(path.posix.basename(file)) && !file.startsWith('web/') && !allowed.has(`/${file}`)) {
      throw new Error(`The video renderer asset allowlist is stale: /${file} is not allowed. Rebuild the complete engine before packaging.`)
    }
  }
  const references = []
  const addReference = (value, from) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return
    const asset = decodeURIComponent(new URL(value, `app://bundle/${from}`).pathname)
    if (!available.has(asset)) throw new Error(`The video renderer references a missing asset: ${asset}.`)
    if (!allowed.has(asset)) throw new Error(`The video renderer references a blocked asset: ${asset}.`)
    references.push(asset.slice(1))
  }
  const index = await readText('index.html')
  for (const match of index.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) addReference(match[1], 'index.html')
  if (!references.some(file => file.endsWith('.css'))) throw new Error('The video renderer HTML does not load a stylesheet.')
  for (const file of files.filter(file => file.endsWith('.css'))) {
    for (const match of (await readText(file)).matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) addReference(match[1], file)
  }
  return [...new Set(['main.js', 'index.html', 'renderer.js', ...references])]
}

export const validateRendererDirectory = async directory => {
  const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  return validateRendererAssets(files, file => readFile(path.join(directory, file), 'utf8'))
}
