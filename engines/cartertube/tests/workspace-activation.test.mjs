import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmbeddedServer, createWorkspaceController } from '../src/main/embedded.mjs'

test('activation focuses the visible workspace without changing its return revision', () => {
  const calls = []
  let visible = true
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    focus: () => calls.push('focus'),
    hide: () => { visible = false; calls.push('hide') }
  }
  const workspace = createWorkspaceController(window, async () => calls.push('pause'))
  assert.deepEqual(workspace.focusCurrent(0), { focused: true })
  assert.equal(workspace.revision, 0)
  assert.deepEqual(calls, ['focus'])
  workspace.returnToMusic()
  assert.deepEqual(workspace.focusCurrent(0), { focused: false })
  assert.deepEqual(workspace.focusCurrent(1), { focused: false })
  assert.equal(workspace.revision, 1)
  assert.equal(visible, false)
  assert.deepEqual(calls, ['focus', 'hide', 'pause'])
  visible = true
  assert.deepEqual(workspace.focusCurrent(0), { focused: false })
  assert.deepEqual(workspace.focusCurrent(1), { focused: true })
  assert.equal(workspace.revision, 1)
  assert.deepEqual(calls, ['focus', 'hide', 'pause', 'focus'])
})

test('activation of a destroyed workspace does not focus or reveal it', () => {
  const workspace = createWorkspaceController({ isDestroyed: () => true }, async () => {})
  assert.deepEqual(workspace.focusCurrent(0), { focused: false })
  assert.equal(workspace.revision, 0)
})

test('workspace activation requires host authentication and a valid return revision', async context => {
  const revisions = []
  const token = 'workspace-activation-test-secret'
  const server = await createEmbeddedServer({ token }, {
    focus: async revision => { revisions.push(revision); return { focused: true } }
  })
  context.after(() => server.close())
  const request = (body, authorization = `Bearer ${token}`) => fetch(`http://127.0.0.1:${server.port}/focus`, {
    method: 'POST',
    headers: { Authorization: authorization },
    body: JSON.stringify(body)
  })
  assert.equal((await request({ returnRevision: 0 }, '')).status, 401)
  for (const returnRevision of [-1, 0.5, '0', null]) {
    assert.equal((await request({ returnRevision })).status, 400)
  }
  assert.deepEqual(revisions, [])
  const response = await request({ returnRevision: 0 })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { focused: true })
  assert.deepEqual(revisions, [0])
})
