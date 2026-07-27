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

function onZenohWheelStates(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-wheel-states:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-wheel-states:message', listener)
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

function onZenohRmfState(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-rmf-state:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-rmf-state:message', listener)
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

function onZenohBonds(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-bonds:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-bonds:message', listener)
  }
}

function onZenohLifecycleTransition(callback) {
  const listener = (_event, message) => callback(message)
  ipcRenderer.on('zenoh-lifecycle-transition:message', listener)

  return () => {
    ipcRenderer.removeListener('zenoh-lifecycle-transition:message', listener)
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
  startZenohWheelStates: options => ipcRenderer.invoke('zenoh-wheel-states:start', options),
  stopZenohWheelStates: () => ipcRenderer.invoke('zenoh-wheel-states:stop'),
  onZenohWheelStates,
  startZenohFleetData: options => ipcRenderer.invoke('zenoh-fleet-data:start', options),
  stopZenohFleetData: () => ipcRenderer.invoke('zenoh-fleet-data:stop'),
  onZenohFleetData,
  startZenohBuildingMap: options => ipcRenderer.invoke('zenoh-building-map:start', options),
  stopZenohBuildingMap: () => ipcRenderer.invoke('zenoh-building-map:stop'),
  onZenohBuildingMap,
  startZenohRmfState: options => ipcRenderer.invoke('zenoh-rmf-state:start', options),
  stopZenohRmfState: () => ipcRenderer.invoke('zenoh-rmf-state:stop'),
  onZenohRmfState,
  startZenohDido: options => ipcRenderer.invoke('zenoh-dido:start', options),
  stopZenohDido: () => ipcRenderer.invoke('zenoh-dido:stop'),
  onZenohDido,
  startZenohHardwareDiagnostics: options => ipcRenderer.invoke('zenoh-hardware-diagnostics:start', options),
  stopZenohHardwareDiagnostics: () => ipcRenderer.invoke('zenoh-hardware-diagnostics:stop'),
  onZenohHardwareDiagnostics,
  startZenohBonds: options => ipcRenderer.invoke('zenoh-bonds:start', options),
  stopZenohBonds: () => ipcRenderer.invoke('zenoh-bonds:stop'),
  onZenohBonds,
  startZenohLifecycleTransition: options => ipcRenderer.invoke('zenoh-lifecycle-transition:start', options),
  stopZenohLifecycleTransition: () => ipcRenderer.invoke('zenoh-lifecycle-transition:stop'),
  onZenohLifecycleTransition,
  publishZenohFleetVelocityCommand: options => ipcRenderer.invoke('zenoh-command:publish-twist', options),
  publishZenohFleetDigitalOutputCommand: options => ipcRenderer.invoke('zenoh-command:write-coil', options),
  listZenohTasks: options => ipcRenderer.invoke('zenoh-command:list-tasks', options),
  listZenohActions: options => ipcRenderer.invoke('zenoh-command:list-actions', options),
  getZenohTask: options => ipcRenderer.invoke('zenoh-command:get-task', options),
  createZenohTask: options => ipcRenderer.invoke('zenoh-command:create-task', options),
  runZenohTask: options => ipcRenderer.invoke('zenoh-command:run-task', options),
  cancelZenohTask: options => ipcRenderer.invoke('zenoh-command:cancel-task', options),
  deleteZenohTask: options => ipcRenderer.invoke('zenoh-command:delete-task', options),
  setZenohStorageAreaDisplayName: options => ipcRenderer.invoke('zenoh-command:set-area-display-name', options),
  reinitZenohStorage: options => ipcRenderer.invoke('zenoh-command:reinit-storage', options),
  getZenohPointCloudRoi: options => ipcRenderer.invoke('zenoh-command:get-point-cloud-roi', options),
  publishZenohFleetLiftRequest: options => ipcRenderer.invoke('zenoh-command:publish-lift-request', options),
  publishZenohFleetDoorRequest: options => ipcRenderer.invoke('zenoh-command:publish-door-request', options),
  stopZenohCommand: () => ipcRenderer.invoke('zenoh-command:stop'),
  onZenohCommand,
  requestCameraGateway: options => ipcRenderer.invoke('camera-gateway:request', options),
  fetchCameraGatewayBinary: options => ipcRenderer.invoke('camera-gateway:fetch-binary', options),
  fetchRobotParameters: options => ipcRenderer.invoke('robot-parameters:fetch', options),
  fetchRobotParameterHeads: options => ipcRenderer.invoke('robot-parameters:fetch-heads', options),
  fetchRobotParametersByHeads: options => ipcRenderer.invoke('robot-parameters:fetch-by-heads', options),
  updateRobotParameter: options => ipcRenderer.invoke('robot-parameters:update', options),
  requestComposeControl: options => ipcRenderer.invoke('compose-control:request', options),
  readShelfStateModbus: options => ipcRenderer.invoke('modbus:shelf-state:read', options),
  writeShelfStateModbus: options => ipcRenderer.invoke('modbus:shelf-state:write', options),
  readModbusCoil: options => ipcRenderer.invoke('modbus:coil:read', options),
  writeModbusCoil: options => ipcRenderer.invoke('modbus:coil:write', options),
  writeModbusCoilSequence: options => ipcRenderer.invoke('modbus:coil-sequence:write', options),
}))
