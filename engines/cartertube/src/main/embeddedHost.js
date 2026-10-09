import { randomUUID } from 'crypto'
import { mkdir, writeFile, rename, unlink } from 'fs/promises'
import path from 'path'
import { createEmbeddedServer, nativeHandleString, createVisibilityController, createWorkspaceController, bindEmbeddedInputFocus } from './embedded.mjs'
import { EMBEDDED_COMMAND_CHANNEL, EMBEDDED_RESULT_CHANNEL, WORKSPACE_RETURN_CHANNEL, WORKSPACE_STATE_CHANNEL } from '../shared/embedded.mjs'

export async function startEmbeddedHost({ app, window, config, ipcMain, windows, isTrusted }) {
  const pending = new Map()
  const workspaceHandoff = process.platform !== 'win32'
  const stopInputFocus = workspaceHandoff ? () => {} : bindEmbeddedInputFocus(window, isTrusted)
  let quitting = false
  app.once('before-quit', () => { quitting = true })
  let variables = {}
  let appearance = {}
  const resultHandler = (event, result) => {
    if (!isTrusted(event.senderFrame?.url) || !result || typeof result.id !== 'string') return
    const request = pending.get(result.id)
    if (!request || request.webContentsId !== event.sender.id) return
    pending.delete(result.id)
    clearTimeout(request.timer)
    if (result.error) request.reject(new Error('Video control failed'))
    else request.resolve(result.status)
  }
  ipcMain.on(EMBEDDED_RESULT_CHANNEL, resultHandler)
  const command = (target, name, data = {}) => new Promise((resolve, reject) => {
    if (target.isDestroyed() || !isTrusted(target.webContents.getURL())) {
      reject(new Error('Video window is not ready'))
      return
    }
    const id = randomUUID()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Video control timed out'))
    }, 750)
    pending.set(id, { resolve, reject, timer, webContentsId: target.webContents.id })
    target.webContents.send(EMBEDDED_COMMAND_CHANNEL, { id, command: name, ...data })
  })
  const controlledWindows = () => windows().filter(target =>
    !target.isDestroyed() && isTrusted(target.webContents.getURL()))
  const pause = () => Promise.all(controlledWindows().map(target => command(target, 'pause')))
  const workspace = createWorkspaceController(window, pause)
  ipcMain.handle(WORKSPACE_STATE_CHANNEL, (event) => {
    if (event.sender.id !== window.webContents.id || !isTrusted(event.senderFrame?.url)) {
      throw new Error('Workspace state is unavailable')
    }
    return { visible: window.isVisible(), returnRevision: workspace.revision }
  })
  const status = async () => ({
    pid: process.pid,
    ...await command(window, 'status'),
    workspaceReturnRevision: workspace.revision
  })
  const returnHandler = (event) => {
    if (workspaceHandoff && event.sender.id === window.webContents.id && isTrusted(event.senderFrame?.url)) {
      workspace.returnToMusic()
    }
  }
  ipcMain.on(WORKSPACE_RETURN_CHANNEL, returnHandler)
  if (workspaceHandoff) {
    window.on('close', (event) => {
      if (!quitting) {
        event.preventDefault()
        workspace.returnToMusic()
      }
    })
  }
  const initialize = (target = window) => command(target, 'initialize', {
    workspaceMode: target.id === window.id ? (workspaceHandoff ? 'handoff' : 'embedded') : 'window'
  })
  const synchronizeAppearance = async (target) => {
    await initialize(target)
    await command(target, 'theme', { variables })
    await command(target, 'appearance', { appearance })
  }
  const windowCreatedHandler = (_event, target) => {
    if (target.id !== window.id) {
      target.webContents.on('did-finish-load', () => {
        if (isTrusted(target.webContents.getURL())) synchronizeAppearance(target).catch(() => {})
      })
    }
  }
  app.on('browser-window-created', windowCreatedHandler)
  const control = await createEmbeddedServer(config, {
    status,
    pause: async () => {
      await pause()
      return status()
    },
    theme: async (newVariables) => {
      variables = { ...variables, ...newVariables }
      await Promise.all(controlledWindows().map(target => command(target, 'theme', { variables })))
      return { applied: true }
    },
    appearance: async (newAppearance) => {
      appearance = { ...appearance, ...newAppearance }
      await Promise.all(controlledWindows().map(target => command(target, 'appearance', { appearance })))
      return { applied: true }
    },
    navigate: async (destination) => {
      await command(window, 'navigate', { path: destination })
      return { navigated: true, path: destination }
    },
    visibility: createVisibilityController(window, pause, workspaceHandoff),
    focus: returnRevision => workspace.focusCurrent(returnRevision),
    shutdown: () => app.quit()
  })
  window.webContents.on('did-finish-load', () => {
    synchronizeAppearance(window).catch(() => {})
  })
  const handshake = {
    pid: process.pid,
    hwnd: workspaceHandoff ? '' : nativeHandleString(window.getNativeWindowHandle()),
    port: control.port
  }
  await initialize()
  await status()
  await mkdir(path.dirname(config.handshakeFile), { recursive: true })
  const temporaryFile = `${config.handshakeFile}.${process.pid}.tmp`
  await writeFile(temporaryFile, JSON.stringify(handshake), { mode: 0o600 })
  await rename(temporaryFile, config.handshakeFile)
  app.once('will-quit', () => {
    stopInputFocus()
    control.close()
    ipcMain.off(EMBEDDED_RESULT_CHANNEL, resultHandler)
    ipcMain.off(WORKSPACE_RETURN_CHANNEL, returnHandler)
    ipcMain.removeHandler(WORKSPACE_STATE_CHANNEL)
    app.off('browser-window-created', windowCreatedHandler)
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('Video engine exited'))
    }
    pending.clear()
    unlink(config.handshakeFile).catch(() => {})
  })
  return control
}
