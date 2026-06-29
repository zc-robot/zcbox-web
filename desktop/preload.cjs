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

function onZenohMotorStates(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-motor-states:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-motor-states:message', listener)
  }
}

function onZenohFleetData(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-fleet-data:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-fleet-data:message', listener)
  }
}

function onZenohBuildingMap(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-building-map:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-building-map:message', listener)
  }
}

function onZenohDido(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-dido:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-dido:message', listener)
  }
}

function onZenohHardwareDiagnostics(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-hardware-diagnostics:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-hardware-diagnostics:message', listener)
  }
}

function onZenohCommand(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-command:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-command:message', listener)
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
  publishZenohActuatorReset: () => ipcRenderer.invoke('zenoh-telemetry:publish-actuator-reset'),
  onZenohTelemetry,
  startZenohMotorStates: options => ipcRenderer.invoke('zenoh-motor-states:start', options),
  stopZenohMotorStates: () => ipcRenderer.invoke('zenoh-motor-states:stop'),
  onZenohMotorStates,
  startZenohFleetData: options => ipcRenderer.invoke('zenoh-fleet-data:start', options),
  stopZenohFleetData: () => ipcRenderer.invoke('zenoh-fleet-data:stop'),
  onZenohFleetData,
  startZenohBuildingMap: options => ipcRenderer.invoke('zenoh-building-map:start', options),
  stopZenohBuildingMap: () => ipcRenderer.invoke('zenoh-building-map:stop'),
  onZenohBuildingMap,
  startZenohDido: options => ipcRenderer.invoke('zenoh-dido:start', options),
  stopZenohDido: () => ipcRenderer.invoke('zenoh-dido:stop'),
  onZenohDido,
  startZenohHardwareDiagnostics: options => ipcRenderer.invoke('zenoh-hardware-diagnostics:start', options),
  stopZenohHardwareDiagnostics: () => ipcRenderer.invoke('zenoh-hardware-diagnostics:stop'),
  onZenohHardwareDiagnostics,
  publishZenohFleetVelocityCommand: options => ipcRenderer.invoke('zenoh-command:publish-twist', options),
  publishZenohFleetDigitalOutputCommand: options => ipcRenderer.invoke('zenoh-command:write-coil', options),
  stopZenohCommand: () => ipcRenderer.invoke('zenoh-command:stop'),
  onZenohCommand,
  requestCameraGateway: options => ipcRenderer.invoke('camera-gateway:request', options),
  fetchCameraGatewayBinary: options => ipcRenderer.invoke('camera-gateway:fetch-binary', options),
  requestComposeControl: options => ipcRenderer.invoke('compose-control:request', options),
  readShelfStateModbus: options => ipcRenderer.invoke('modbus:shelf-state:read', options),
  writeShelfStateModbus: options => ipcRenderer.invoke('modbus:shelf-state:write', options),
  readModbusCoil: options => ipcRenderer.invoke('modbus:coil:read', options),
  writeModbusCoil: options => ipcRenderer.invoke('modbus:coil:write', options),
  writeModbusCoilSequence: options => ipcRenderer.invoke('modbus:coil-sequence:write', options),
}))
