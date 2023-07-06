export type Operation =
  | 'move'
  | 'select'
  | 'waypoint'
  | 'pathway'

export interface MapData {
  id: number,
  name: string,
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
  task_uid: string,
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
  uid: string,
  map_id: number,
  name: string,
  description: string,
  data: {
    waypoints: NavPoint[],
    paths: NavPath[],
  },
  tasks: NavTask[],
}

export interface NavPoint {
  uid: string,
  name: string,
  x: number,
  y: number,
  rotation: number,
}

// NavPath is a bezier line segment between two NavPoints
export interface NavPath {
  uid: string,
  name: string,
  start: {
    x: number,
    y: number,
  },
  end: {
    x: number,
    y: number,
  },
  controls: {
    x: number,
    y: number,
  }[],
}

type PointNavType = 'auto' | 'manually'

export interface TaskPoint {
  uid: string,
  type: PointNavType,
  precise: boolean,
  reverse: boolean,
  actions: {
    type: string,
    args: any,
  }[],
}

export interface NavTask {
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
