import assert from 'node:assert/strict'
import test from 'node:test'

import { validateRendererAssets } from '../_scripts/validateRendererAssets.mjs'

const fixture = overrides => {
  const files = {
    'index.html': '<link href="renderer.current.css" rel="stylesheet"><script src="renderer.js"></script>',
    'renderer.js': 'render()',
    'renderer.current.css': '@font-face{src:url(fonts/body.woff2)}',
    'fonts/body.woff2': 'font',
    ...overrides,
  }
  files['main.js'] ??= `const allowed = new Set(${JSON.stringify(Object.keys(files).map(file => `/${file}`))});`
  return validateRendererAssets(Object.keys(files), async file => files[file])
}

test('accepts renderer entry points and font assets covered by the allowlist', async () => {
  assert.ok((await fixture({})).includes('fonts/body.woff2'))
})

test('rejects a stylesheet hash changed after allowlist injection', async () => {
  await assert.rejects(fixture({ 'main.js': 'new Set(["/index.html","/renderer.js","/renderer.old.css","/fonts/body.woff2"])' }), /allowlist is stale.*current\.css/)
})

test('rejects a stylesheet asset missing from the packaged archive', async () => {
  await assert.rejects(fixture({ 'renderer.current.css': 'a{background:url(missing.png)}' }), /missing asset.*missing\.png/)
})

test('rejects an engine packed without its stylesheet entry', async () => {
  await assert.rejects(fixture({ 'index.html': '<script src="renderer.js"></script>' }), /does not load a stylesheet/)
})

test('rejects an engine whose main process has not received its allowlist', async () => {
  await assert.rejects(fixture({ 'main.js': 'new Set(__FREETUBE_ALLOWED_PATHS__)' }), /allowlist is missing/)
})
