import http from 'node:http'
import path from 'node:path'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import { sanitizeThemeVariables, sanitizeNavigationPath, sanitizeAppearance, EMBEDDED_COMMAND_CHANNEL } from '../shared/embedded.mjs'

export function readEmbeddedConfig (env = process.env, argv = process.argv) {
  if (env.CARTERMEDIA_EMBEDDED !== '1') return null
  const handshakeFile = env.CARTERMEDIA_HANDSHAKE_FILE
  const token = env.CARTERMEDIA_CONTROL_TOKEN
  const parentPid = Number(env.CARTERMEDIA_PARENT_PID)
  const directoryArg = argv.find(arg => arg.startsWith('--user-data-dir='))
  const directoryIndex = argv.indexOf('--user-data-dir')
  const userDataDirectory = directoryArg?.slice('--user-data-dir='.length) ??
    (directoryIndex >= 0 ? argv[directoryIndex + 1] : null)
  if (!handshakeFile || !path.isAbsolute(handshakeFile) ||
    !token || token.length < 16 || token.length > 256 ||
    !Number.isSafeInteger(parentPid) || parentPid <= 0 ||
    !userDataDirectory || !path.isAbsolute(userDataDirectory)) {
    throw new Error('Invalid CarterMedia embedded launch configuration')
  }
  return { handshakeFile, token, parentPid, userDataDirectory }
}

export function nativeHandleString (buffer) {
  if (buffer.length === 8) return buffer.readBigUInt64LE().toString()
  if (buffer.length === 4) return buffer.readUInt32LE().toString()
  throw new Error('Unsupported native window handle')
}

export function quitEmbeddedForRestart (config, application) {
  if (!config) return false
  application.quit()
  return true
}

export function toggleWindowFullscreen (window, embeddedWindowId, isTrusted) {
  if (!window || window.isDestroyed()) return
  if (window.id === embeddedWindowId) {
    if (!isTrusted(window.webContents.getURL())) return
    window.webContents.send(EMBEDDED_COMMAND_CHANNEL, { id: randomUUID(), command: 'toggleFullscreen' })
  } else {
    window.setFullScreen(!window.isFullScreen())
  }
}

export function bindEmbeddedInputFocus (window, isTrusted) {
  const contents = window.webContents
  let stopped = false
  const focusInput = (_event, input) => {
    if (input.type !== 'mouseDown' || window.isDestroyed() || !window.isVisible() ||
        contents.isDestroyed() || !isTrusted(contents.getURL())) return
    contents.focus()
  }
  const stop = () => {
    if (stopped) return
    stopped = true
    contents.off('before-mouse-event', focusInput)
    contents.off('destroyed', stop)
    window.off('closed', stop)
  }
  contents.on('before-mouse-event', focusInput)
  contents.once('destroyed', stop)
  window.once('closed', stop)
  return stop
}

export function createVisibilityController (window, pause, focus = false) {
  let revision = 0
  let pendingPause = Promise.resolve()
  return async (visible, requestedRevision) => {
    if (window.isDestroyed()) throw new Error('Video window is unavailable')
    if (requestedRevision < revision) return { visible: window.isVisible(), revision }
    revision = requestedRevision
    if (visible) {
      await pendingPause
      if (requestedRevision < revision) return { visible: window.isVisible(), revision }
      if (focus) {
        window.show()
        window.focus()
      } else {
        window.showInactive()
      }
    } else {
      window.hide()
      pendingPause = Promise.all([pendingPause, pause()])
      await pendingPause
    }
    return { visible: window.isVisible(), revision }
  }
}

export function createWorkspaceController (window, pause) {
  let revision = 0
  return {
    get revision () { return revision },
    focusCurrent: requestedRevision => {
      if (window.isDestroyed() || requestedRevision !== revision || !window.isVisible()) return { focused: false }
      window.focus()
      return { focused: true }
    },
    returnToMusic: () => {
      if (window.isDestroyed()) return
      revision++
      window.hide()
      pause().catch(() => {})
    }
  }
}

export function watchParent (parentPid, shutdown, intervalMs = 1000, probe = process.kill) {
  const timer = setInterval(() => {
    try {
      probe(parentPid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') {
        clearInterval(timer)
        shutdown()
      }
    }
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

function readRequestBody (request, maximumSize) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const dataHandler = (chunk) => {
      size += chunk.length
      if (size > maximumSize) {
        request.off('data', dataHandler)
        request.resume()
        reject(new Error('Request too large'))
      } else {
        chunks.push(chunk)
      }
    }
    request.on('data', dataHandler)
    request.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.once('error', reject)
  })
}

export async function createEmbeddedServer (config, actions) {
  const expected = Buffer.from(`Bearer ${config.token}`)
  const server = http.createServer(async (request, response) => {
    const reply = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(data))
    }
    const actual = Buffer.from(request.headers.authorization ?? '')
    if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.origin ||
      actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      reply(401, { error: 'Unauthorized' })
      return
    }
    const route = request.url
    const isStatus = route === '/status'
    if (!isStatus && !['/pause', '/theme', '/appearance', '/navigate', '/visibility', '/focus', '/shutdown'].includes(route)) {
      reply(404, { error: 'Unknown command' })
      return
    }
    if (request.method !== (isStatus ? 'GET' : 'POST')) {
      reply(405, { error: 'Method not allowed' })
      return
    }
    try {
      let body
      try {
        body = await readRequestBody(request, route === '/appearance' ? 6000000 : 16384)
      } catch {
        reply(413, { error: 'Request too large' })
        return
      }
      if (route === '/theme') {
        let variables
        try {
          variables = sanitizeThemeVariables(JSON.parse(body).variables)
        } catch {
          reply(400, { error: 'Invalid theme' })
          return
        }
        reply(200, await actions.theme(variables))
      } else if (route === '/appearance') {
        let appearance
        try {
          appearance = sanitizeAppearance(JSON.parse(body).appearance)
        } catch {
          reply(400, { error: 'Invalid appearance' })
          return
        }
        reply(200, await actions.appearance(appearance))
      } else if (route === '/navigate') {
        let destination
        try {
          destination = sanitizeNavigationPath(JSON.parse(body).path)
        } catch {
          reply(400, { error: 'Invalid navigation path' })
          return
        }
        reply(200, await actions.navigate(destination))
      } else if (route === '/visibility') {
        let visibility
        try {
          visibility = JSON.parse(body)
          if (typeof visibility.visible !== 'boolean' || !Number.isSafeInteger(visibility.revision) || visibility.revision <= 0) {
            throw new Error('Invalid visibility')
          }
        } catch {
          reply(400, { error: 'Invalid visibility' })
          return
        }
        reply(200, await actions.visibility(visibility.visible, visibility.revision))
      } else if (route === '/focus') {
        let returnRevision
        try {
          returnRevision = JSON.parse(body).returnRevision
          if (!Number.isSafeInteger(returnRevision) || returnRevision < 0) throw new Error('Invalid return revision')
        } catch {
          reply(400, { error: 'Invalid return revision' })
          return
        }
        reply(200, await actions.focus(returnRevision))
      } else if (route === '/pause') {
        reply(200, await actions.pause())
      } else if (route === '/status') {
        reply(200, await actions.status())
      } else {
        reply(200, { stopping: true })
        setTimeout(actions.shutdown, 20).unref()
      }
    } catch {
      if (!response.headersSent) reply(503, { error: 'Video engine is not ready' })
    }
  })
  server.requestTimeout = 3000
  server.headersTimeout = 3000
  server.keepAliveTimeout = 1000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    port: server.address().port,
    close: () => new Promise(resolve => {
      server.close(resolve)
      server.closeIdleConnections()
    })
  }
}
