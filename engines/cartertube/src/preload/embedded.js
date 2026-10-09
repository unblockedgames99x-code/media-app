import { contextBridge, ipcRenderer, webFrame } from 'electron/renderer'
import { EMBEDDED_COMMAND_CHANNEL, EMBEDDED_RESULT_CHANNEL, WORKSPACE_RETURN_CHANNEL, WORKSPACE_STATE_CHANNEL, sanitizeThemeVariables, sanitizeNavigationPath, sanitizeAppearance, navigationStatus } from '../shared/embedded.mjs'
import { applyPersonalization, applyAppearance, getAppearance } from './personalization'

contextBridge.exposeInMainWorld('mediaWorkspace', {
  returnToMusic: () => ipcRenderer.send(WORKSPACE_RETURN_CHANNEL),
  getWindowState: () => ipcRenderer.invoke(WORKSPACE_STATE_CHANNEL),
  getAppearance: () => getAppearance()
})

function status() {
  const media = Array.from(document.querySelectorAll('video, audio'))
  const active = media.find(element => !element.paused && !element.ended)
  const current = active ?? media[0]
  return {
    ...navigationStatus(window.location.hash, document.querySelector('.app')?.dataset.cartermediaNavigation),
    paused: !active,
    fullscreen: !!document.fullscreenElement,
    currentTime: Number.isFinite(current?.currentTime) ? current.currentTime : 0,
    duration: Number.isFinite(current?.duration) ? current.duration : 0,
    title: document.title
  }
}

ipcRenderer.on(EMBEDDED_COMMAND_CHANNEL, async (_event, message) => {
  if (!message || typeof message.id !== 'string') return
  try {
    if (message.command === 'initialize') {
      document.documentElement.classList.add('carterMediaEmbedded')
      document.documentElement.classList.toggle('carterMediaWorkspace', message.workspaceMode !== 'embedded')
      document.documentElement.dataset.workspaceMode = message.workspaceMode
      window.dispatchEvent(new Event('cartermedia:workspace'))
    } else if (message.command === 'pause') {
      for (const media of document.querySelectorAll('video, audio')) media.pause()
      if (document.fullscreenElement) await document.exitFullscreen()
    } else if (message.command === 'theme') {
      const variables = sanitizeThemeVariables(message.variables)
      for (const [key, value] of Object.entries(variables)) {
        document.documentElement.style.setProperty(`--cm${key.slice(1)}`, value)
      }
      applyPersonalization(variables)
    } else if (message.command === 'appearance') {
      applyAppearance(sanitizeAppearance(message.appearance))
      window.dispatchEvent(new Event('cartermedia:appearance'))
    } else if (message.command === 'navigate') {
      window.location.hash = sanitizeNavigationPath(message.path)
    } else if (message.command === 'toggleFullscreen') {
      await webFrame.executeJavaScript('document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()', true)
    } else if (message.command !== 'status') {
      throw new Error('Unknown embedded command')
    }
    ipcRenderer.send(EMBEDDED_RESULT_CHANNEL, { id: message.id, status: status() })
  } catch {
    ipcRenderer.send(EMBEDDED_RESULT_CHANNEL, { id: message.id, error: true })
  }
})
