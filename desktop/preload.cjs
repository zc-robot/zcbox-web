const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('zcDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
}))
