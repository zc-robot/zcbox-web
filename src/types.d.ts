export type LanguageCode = "en" | "zh-CN"

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
