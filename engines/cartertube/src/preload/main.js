import { contextBridge } from 'electron/renderer'
import api from './interface.js'
import './embedded.js'

contextBridge.exposeInMainWorld('ftElectron', api)
