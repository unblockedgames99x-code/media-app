import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as Vue from 'vue'
import { babelParse, compileTemplate, parse } from 'vue/compiler-sfc'
import { renderToString } from 'vue/server-renderer'
import { useManagedWorkspace } from '../src/renderer/composables/managedWorkspace.mjs'

const root = new URL('../src/renderer/', import.meta.url)

async function renderSettings(file, values) {
  const { descriptor } = parse(await readFile(new URL(file, root), 'utf8'))
  const compiled = compileTemplate({
    source: descriptor.template.content,
    filename: file,
    id: file,
    compilerOptions: { mode: 'function' },
  })
  assert.deepEqual(compiled.errors, [])
  const render = new Function('Vue', compiled.code)(Vue)
  const context = new Proxy({
    $t: key => key,
    t: key => key,
    usingElectron: true,
    USING_ELECTRON: true,
    SUPPORTS_LOCAL_API: true,
    IS_MAC: false,
    isLinuxWayland: false,
    regionDataLoaded: true,
    ...values,
  }, { get: (target, key) => target[key] })
  const app = Vue.createSSRApp({ render: () => render(context, []) })
  for (const name of new Set([...descriptor.template.content.matchAll(/<([A-Z]\w*)/g)].map(match => match[1]))) {
    app.component(name, {
      inheritAttrs: false,
      props: ['label', 'placeholder'],
      setup: (props, { slots }) => () => Vue.h('div', props.label || props.placeholder || slots.default?.()),
    })
  }
  return renderToString(app)
}

const themeSettings = 'components/ThemeSettings.vue'
const generalSettings = 'components/GeneralSettings/GeneralSettings.vue'
const theme = label => `Settings.Theme Settings.${label}`
const general = label => `Settings.General Settings.${label}`

test('managed Videos hides overridden palettes and keeps functional display settings', async () => {
  for (const isEmbeddedWorkspace of [true, false]) {
    const html = await renderSettings(themeSettings, { isManagedWorkspace: true, isEmbeddedWorkspace })
    for (const label of ['Base Theme.Base Theme', 'Main Color Theme.Main Color Theme', 'Secondary Color Theme', 'Match Top Bar with Main Color']) {
      assert.ok(!html.includes(theme(label)), label)
    }
    for (const label of ['UI Scale', 'Disable Smooth Scrolling', 'Hide FreeTube Header Logo']) {
      assert.ok(html.includes(theme(label)), label)
    }
    for (const label of ['Expand Side Bar by Default', 'Hide Side Bar Labels']) {
      assert.equal(html.includes(theme(label)), !isEmbeddedWorkspace, label)
    }
  }
})

test('standalone Videos retains all original theme controls', async () => {
  const html = await renderSettings(themeSettings, { isManagedWorkspace: false, isEmbeddedWorkspace: false })
  for (const label of ['Base Theme.Base Theme', 'Main Color Theme.Main Color Theme', 'Secondary Color Theme', 'Match Top Bar with Main Color', 'Expand Side Bar by Default', 'Hide Side Bar Labels', 'UI Scale', 'Disable Smooth Scrolling', 'Hide FreeTube Header Logo']) {
    assert.ok(html.includes(theme(label)), label)
  }
})

test('managed General settings removes only host-owned desktop controls', async () => {
  const html = await renderSettings(generalSettings, { isManagedWorkspace: true })
  for (const label of ['Check for Updates', 'Open Deep Links In New Window', 'Minimize to system tray']) {
    assert.ok(!html.includes(general(label)), label)
  }
  for (const label of ['Fallback to Non-Preferred Backend on Failure', 'Auto Load Next Page.Label', 'Enable Search Suggestions', 'Preferred API Backend.Preferred API Backend', 'Default Landing Page', 'Video View Type.Video View Type', 'Thumbnail Preference.Thumbnail Preference', 'Locale Preference', 'Region for Trending', 'External Link Handling.External Link Handling']) {
    assert.ok(html.includes(general(label)), label)
  }
})

test('standalone General settings keeps supported desktop controls', async () => {
  const html = await renderSettings(generalSettings, { isManagedWorkspace: false })
  for (const label of ['Check for Updates', 'Open Deep Links In New Window', 'Minimize to system tray']) {
    assert.ok(html.includes(general(label)), label)
  }
  const mac = await renderSettings(generalSettings, { isManagedWorkspace: false, IS_MAC: true })
  assert.ok(!mac.includes(general('Minimize to system tray')))
  const wayland = await renderSettings(generalSettings, { isManagedWorkspace: false, isLinuxWayland: true })
  assert.ok(!wayland.includes(general('Minimize to system tray')))
})

test('managed mode updates after authenticated initialization and cleans up on unmount', async () => {
  const classes = new Set()
  const pageDocument = { documentElement: { dataset: {}, classList: { contains: value => classes.has(value) } } }
  const events = new EventTarget()
  let state
  const renderer = Vue.createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
  })
  const app = renderer.createApp({
    setup() {
      state = useManagedWorkspace(pageDocument, events)
      return () => null
    },
  })
  app.mount({})
  assert.equal(state.isManagedWorkspace.value, false)
  pageDocument.documentElement.dataset.workspaceMode = 'embedded'
  events.dispatchEvent(new Event('cartermedia:workspace'))
  assert.equal(state.isManagedWorkspace.value, false)
  classes.add('carterMediaEmbedded')
  events.dispatchEvent(new Event('cartermedia:workspace'))
  assert.equal(state.isManagedWorkspace.value, true)
  assert.equal(state.isEmbeddedWorkspace.value, true)
  for (const mode of ['handoff', 'window']) {
    pageDocument.documentElement.dataset.workspaceMode = mode
    events.dispatchEvent(new Event('cartermedia:workspace'))
    assert.equal(state.isManagedWorkspace.value, true)
    assert.equal(state.isEmbeddedWorkspace.value, false)
  }
  app.unmount()
  classes.clear()
  events.dispatchEvent(new Event('cartermedia:workspace'))
  assert.equal(state.isManagedWorkspace.value, true)
})

async function updateCheck(values) {
  const { descriptor } = parse(await readFile(new URL('App.vue', root), 'utf8'))
  const script = descriptor.scriptSetup.content
  const declaration = babelParse(script, { sourceType: 'module' }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'checkForNewUpdates')
  const context = {
    isManagedWorkspace: Vue.ref(false),
    checkForUpdates: Vue.ref(true),
    showUpdatesBanner: Vue.ref(false),
    latestVersionNumber: Vue.ref(''),
    updateChangelog: Vue.ref(''),
    changeLogTitle: Vue.ref(''),
    packageDetails: { version: '0.25.3' },
    marked: { parse: value => value },
    ...values,
  }
  const check = new Function(...Object.keys(context), `return ${script.slice(declaration.start, declaration.end)}`)(...Object.values(context))
  await check()
  return context
}

test('managed app never checks unrelated upstream releases, even with a migrated enabled preference', async () => {
  let requests = 0
  await updateCheck({ isManagedWorkspace: Vue.ref(true), fetch: () => { requests++; throw new Error('Unexpected upstream request') } })
  await updateCheck({ checkForUpdates: Vue.ref(false), fetch: () => { requests++; throw new Error('Unexpected upstream request') } })
  assert.equal(requests, 0)
})

test('standalone updater remains functional and ignores a response if the app becomes managed', async () => {
  const release = [{ tag_name: 'v0.26.0-beta', body: 'Release notes', name: 'New release' }]
  const standalone = await updateCheck({ fetch: async () => ({ json: async () => release }) })
  assert.equal(standalone.showUpdatesBanner.value, true)
  assert.equal(standalone.latestVersionNumber.value, '0.26.0')
  const isManagedWorkspace = Vue.ref(false)
  const managed = await updateCheck({
    isManagedWorkspace,
    fetch: async () => ({ json: async () => { isManagedWorkspace.value = true; return release } }),
  })
  assert.equal(managed.showUpdatesBanner.value, false)
  assert.equal(managed.latestVersionNumber.value, '')
})
