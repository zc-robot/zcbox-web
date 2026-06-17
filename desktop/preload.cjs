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

function onZenohTelemetry(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-telemetry:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-telemetry:message', listener)
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
  startZenohTelemetry: options => ipcRenderer.invoke('zenoh-telemetry:start', options),
  stopZenohTelemetry: () => ipcRenderer.invoke('zenoh-telemetry:stop'),
  publishZenohVelocityCommand: command => ipcRenderer.invoke('zenoh-telemetry:publish-cmd-vel', command),
  onZenohTelemetry,
  requestCameraGateway: options => ipcRenderer.invoke('camera-gateway:request', options),
  fetchCameraGatewayBinary: options => ipcRenderer.invoke('camera-gateway:fetch-binary', options),
  readShelfStateModbus: options => ipcRenderer.invoke('modbus:shelf-state:read', options),
  writeShelfStateModbus: options => ipcRenderer.invoke('modbus:shelf-state:write', options),
  readModbusCoil: options => ipcRenderer.invoke('modbus:coil:read', options),
  writeModbusCoil: options => ipcRenderer.invoke('modbus:coil:write', options),
}))
