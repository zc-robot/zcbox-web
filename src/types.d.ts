export type LanguageCode = "en" | "zh-CN"

export type AppMode = 'robot' | 'fleet'

export type Operation =
  | 'move'
  | 'select'
  | 'waypoint'
  | 'waypointLine'
  | 'pathway'
  | 'door'
  | 'lift'
  | 'relocalize'

export interface MapListItem {
  id: number
  name: string
  deploy: string
  localization_map_file_path: string
  localization_map_yaml_file_path: string
  navigation_map_file_path: string
  navigation_map_yaml_file_path: string
  info: GridInfoMessage
}
  
export interface MapData {
  id: number,
  name: string,
}

export interface CurrentMapData {
  map_id: number,
  map_name: string,
}

export interface MapDataDetail {
  id: number,
  name: string,
  data: OccupancyGridMessage,
  deployment: NavProfile[],
}

export interface GridInfoMessage {
  resolution: number,
  width: number,
  height: number,
  origin: PoseMessage,
}

export interface OccupancyGridMessage {
  info: GridInfoMessage,
  data: number[],
}

export type RobotStatus =
  | 'idle'
  | 'moving'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export interface RobotInfoMessage {
  pose: PoseMessage,
  fsm: RobotStatus,
  localization_quality: number,
  task_uid: string,
  battery: number,
  batteryCurrent: number,
}

export interface LaserScanMessage {
  key?: string,
  topic?: string,
  frameId?: string,
  originalFrameId?: string,
  targetFrameId?: string,
  transformApplied?: boolean,
  tfFrameCount?: number,
  stamp?: {
    sec: number,
    nanosec: number,
  },
  angleMin: number,
  angleIncrement: number,
  rangeMin: number,
  rangeMax: number,
  ranges: number[],
  points?: [number, number, number][],
}

export interface TwistCommand {
  linearX?: number,
  linearY?: number,
  linearZ?: number,
  angularX?: number,
  angularY?: number,
  angularZ?: number,
}

export interface MotorStateMessage {
  id: number,
  voltage: number,
  name: string,
  speed: number,
  position: number,
  temperature: number,
  payload: number,
  isEnabled: boolean,
  isPowered: boolean,
  isFaulted: boolean,
  isConnected: boolean,
  errorCode: number,
  errorMessage: string,
}

export interface MotorStatesMessage {
  key?: string,
  header: {
    stamp: {
      sec: number,
      nanosec: number,
    },
    frameId: string,
  },
  motorStates: MotorStateMessage[],
}

export interface UInt8MultiArrayDimensionMessage {
  label: string,
  size: number,
  stride: number,
}

export interface UInt8MultiArrayBitMessage {
  index: number,
  byteIndex: number,
  bitIndex: number,
  value: boolean,
}

export interface UInt8MultiArrayMessage {
  key?: string,
  namespace?: string,
  channel?: 'di' | 'do' | 'unknown',
  layout: {
    dim: UInt8MultiArrayDimensionMessage[],
    dataOffset: number,
  },
  data: number[],
  bits: UInt8MultiArrayBitMessage[],
}

export interface FleetTimeMessage {
  sec: number,
  nanosec: number,
}

export interface FleetHeaderMessage {
  stamp: FleetTimeMessage,
  frameId: string,
}

export interface FleetLocationMessage {
  map: string,
  levelName: string,
  hasPose: boolean,
  x: number,
  y: number,
  yaw: number,
}

export interface FleetRobotFootprintMessage {
  isRound: boolean,
  radius: number,
  robotLength: number,
  robotWidth: number,
  navCenterToRobotCenter: number,
}

export interface FleetMotorStateMessage {
  id: number,
  name: string,
  voltage: number,
  speed: number,
  position: number,
  temperature: number,
  payload: number,
  isEnabled: boolean,
  isPowered: boolean,
  isFaulted: boolean,
  isConnected: boolean,
  errorCode: number,
  errorMessage: string,
}

export interface FleetWheelStateMessage {
  stamp: FleetTimeMessage,
  motors: FleetMotorStateMessage[],
}

export interface FleetDiagnosticKeyValueMessage {
  key: string,
  value: string,
}

export interface FleetDiagnosticStatusMessage {
  level: number,
  name: string,
  message: string,
  hardwareId: string,
  values: FleetDiagnosticKeyValueMessage[],
}

export interface FleetDiagnosticStateMessage {
  stamp: FleetTimeMessage,
  status: FleetDiagnosticStatusMessage[],
}

export interface FleetPalletStateMessage {
  palletPresent: boolean,
  bufferPresent: boolean,
  palletStock: number,
  bufferStock: number,
  raw: number[],
}

export interface FleetRobotDataMessage {
  robot: string,
  name: string,
  model: string,
  ip: string,
  zenohNamespace: string,
  status: string,
  statusDetail: string,
  lastAttemptTime: number,
  retryPeriodSec: number,
  mode: string,
  taskId: string,
  activityId: string,
  map: string,
  location: FleetLocationMessage,
  hasFootprint: boolean,
  footprint: FleetRobotFootprintMessage,
  hasBattery: boolean,
  battery: number,
  hasBatteryPercent: boolean,
  batteryPercent: number,
  hasBatteryCurrent: boolean,
  batteryCurrent: number,
  hasWheelState: boolean,
  wheels: FleetWheelStateMessage,
  hasDiagnostics: boolean,
  diagnostics: FleetDiagnosticStateMessage,
  hasPalletState: boolean,
  palletState: FleetPalletStateMessage,
}

export interface FleetDataMessage {
  key?: string,
  header: FleetHeaderMessage,
  fleetType: string,
  name: string,
  seq: number,
  unixMillisTime: number,
  robots: FleetRobotDataMessage[],
  pendingRobots: FleetRobotDataMessage[],
}

export interface BuildingMapParamMessage {
  name: string,
  type: number,
  valueInt: number,
  valueFloat: number,
  valueString: string,
  valueBool: boolean,
}

export interface BuildingMapImageMessage {
  name: string,
  xOffset: number,
  yOffset: number,
  yaw: number,
  scale: number,
  encoding: string,
  dataBase64: string,
  dataLength: number,
  width?: number,
  height?: number,
}

export interface BuildingMapPlaceMessage {
  name: string,
  x: number,
  y: number,
  yaw: number,
  positionTolerance: number,
  yawTolerance: number,
}

export interface BuildingMapDoorMessage {
  name: string,
  v1X: number,
  v1Y: number,
  v2X: number,
  v2Y: number,
  doorType: number,
  motionRange: number,
  motionDirection: number,
}

export interface BuildingMapGraphVertexMessage {
  x: number,
  y: number,
  name: string,
  params: BuildingMapParamMessage[],
}

export interface BuildingMapGraphEdgeMessage {
  v1: number,
  v2: number,
  type: number,
  params: BuildingMapParamMessage[],
}

export interface BuildingMapGraphMessage {
  name: string,
  type: 'nav' | 'wall',
  vertices: BuildingMapGraphVertexMessage[],
  edges: BuildingMapGraphEdgeMessage[],
  params: BuildingMapParamMessage[],
}

export interface BuildingMapLevelMessage {
  name: string,
  elevation: number,
  images: BuildingMapImageMessage[],
  places: BuildingMapPlaceMessage[],
  doors: BuildingMapDoorMessage[],
  graphs: BuildingMapGraphMessage[],
}

export interface BuildingMapLiftMessage {
  name: string,
  levels: string[],
  doors: BuildingMapDoorMessage[],
  wallGraph: BuildingMapGraphMessage,
  refX: number,
  refY: number,
  refYaw: number,
  width: number,
  depth: number,
}

export interface BuildingMapMessage {
  key?: string,
  name: string,
  levels: BuildingMapLevelMessage[],
  lifts: BuildingMapLiftMessage[],
}

export type PointCloudPoint = [number, number, number]

export interface PointCloudMessage {
  key?: string,
  topic?: string,
  frameId: string,
  originalFrameId?: string,
  targetFrameId?: string,
  transformApplied?: boolean,
  tfFrameCount?: number,
  stamp: {
    sec: number,
    nanosec: number,
  },
  height: number,
  width: number,
  pointStep: number,
  rowStep: number,
  isDense: boolean,
  pointCount: number,
  sampledCount: number,
  points: PointCloudPoint[],
}

export interface PoseMessage {
  position: PointMessage,
  orientation: QuaternionMessage,
  pyr: EulerAnglesMessage
}

export interface PointMessage {
  x: number,
  y: number,
  z: number,
}

export interface EulerAnglesMessage {
  pitch: number,
  roll: number,
  yaw: number,
}

export interface QuaternionMessage {
  x: number,
  y: number,
  z: number,
  w: number,
}

export interface NavProfile {
  id?: number,
  uid: string,
  map_id: number,
  name: string,
  description: string,
  data: {
    waypoints: NavPoint[],
    paths: NavPath[],
    doors: NavDoor[],
    lifts: NavLift[],
  },
  tasks: NavTask[],
}

export interface NavPoint {
  uid: string,
  name: string,
  x: number,
  y: number,
  rotation: number,
  is_charger?: boolean,
  is_parking_spot?: boolean,
  line_constraint?: LineConstraint,
}

export interface LineConstraint {
  uid: string,
  start: {
    x: number,
    y: number,
  },
  end: {
    x: number,
    y: number,
  },
}

// NavPath is a bezier line segment between two NavPoints
export interface NavPath {
  uid: string,
  name: string,
  thickness: number,
  start: {
    uid: string,
    x: number,
    y: number,
  },
  end: {
    uid: string,
    x: number,
    y: number,
  },
  controls: {
    x: number,
    y: number,
  }[],
}

export type DoorType = 'sliding' | 'hinged' | 'double_sliding' | 'double_hinged'

export interface NavDoor {
  uid: string,
  name: string,
  x: number,
  y: number,
  rotation: number,
  width: number,
  door_type: DoorType,
}

export interface NavLift {
  uid: string,
  name: string,
  x: number,
  y: number,
  rotation: number,
  width: number,
  depth: number,
  level_name: string,
}

type PointNavType = 'auto' | 'manually'

export interface TaskPoint {
  uid: string,
  type: PointNavType,
  precise: boolean,
  precise_xy: number,
  precise_rad: number,
  reverse: boolean,
  dest: boolean,
  actions: PointAction[],
}

export interface NavTask {
  id?: number,
  uid: string,
  name: string,
  description: string,
  points: TaskPoint[],
}

export interface RobotParams {
  urdf: JointParams[],
  robot_footprint: FootprintParams
}

export interface JointParams {
  name: string,
  type: string,
  parent: string,
  child: string,
  x: number,
  y: number,
  z: number,
  roll: number,
  pitch: number,
  yaw: number,
}

export interface FootprintParams {
  is_round: boolean,
  radius: number,
  robot_length: number,
  robot_width: number,
  nav_center2robot_center: number,
}

export interface PointAction {
  id: number,
  name: string,
}
