import { app } from 'electron'
import { mkdirSync } from 'fs'
import { readEmbeddedConfig } from './embedded.mjs'

export const embeddedConfig = readEmbeddedConfig()

if (embeddedConfig) {
  mkdirSync(embeddedConfig.userDataDirectory, { recursive: true })
  app.setPath('userData', embeddedConfig.userDataDirectory)
  const debugPort = Number(process.env.CARTERMEDIA_VIDEO_DEBUG_PORT)
  if (Number.isSafeInteger(debugPort) && debugPort >= 1024 && debugPort <= 65535) {
    app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
    app.commandLine.appendSwitch('remote-debugging-port', String(debugPort))
  }
}
