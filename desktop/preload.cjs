const { contextBridge, ipcRenderer } = require('electron')

function onZenohRobotPose(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-robot-pose:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-robot-pose:message', listener)
  }
}

function onZenohPointCloud(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-pointcloud:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-pointcloud:message', listener)
  }
}

contextBridge.exposeInMainWorld('zcDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  startZenohRobotPose: options => ipcRenderer.invoke('zenoh-robot-pose:start', options),
  stopZenohRobotPose: () => ipcRenderer.invoke('zenoh-robot-pose:stop'),
  onZenohRobotPose,
  startZenohPointCloud: options => ipcRenderer.invoke('zenoh-pointcloud:start', options),
  stopZenohPointCloud: () => ipcRenderer.invoke('zenoh-pointcloud:stop'),
  onZenohPointCloud,
}))
