export type Operation =
  | 'move'
  | 'select'
  | 'waypoint'
  | 'pathway'

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

export interface RobotInfoMessage {
  robot_pose: PoseMessage
}

export interface PoseMessage {
  position: PointMessage,
  orientation: QuaternionMessage,
}

export interface PointMessage {
  x: number,
  y: number,
  z: number,
}

export interface QuaternionMessage {
  x: number,
  y: number,
  z: number,
  w: number,
}

export interface NavPoint {
  id: string,
  x: number,
  y: number,
  rotation: number,
}

// NavPath is a bezier line segment between two NavPoints
export interface NavPath {
  id: string
  start: NavPoint,
  end: NavPoint,
  controls: NavPoint[],
}

type PointNavType = 'auto' | 'manually'

export interface TaskPoint {
  id: string,
  type: PointNavType,
  precise: boolean,
  reverse: boolean,
  actions: {
    type: string,
    args: any,
  }[],
}

export interface NavTask {
  id: string,
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
