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
  point: NavPoint,
  type: PointNavType,
  actions: {
    type: string,
    args: number,
  }[],
}

export interface NavTask {
  id: string,
  points: TaskPoint[],
}
