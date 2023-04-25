export type Operation =
  | "move"
  | "select"
  | "waypoint"
  | "pathway"

export type GridInfoMessage = {
  resolution: number,
  width: number,
  height: number,
  origin: PoseMessage,
}

export type OccupancyGridMessage = {
  header?: {
    frame_id: string,
  },
  info: GridInfoMessage,
  data: number[],
}

export type RobotInfoMessage = {
  robot_pose: PoseMessage
}

export type PoseMessage = {
  position: PointMessage,
  orientation: QuaternionMessage,
}

export type PointMessage = {
  x: number,
  y: number,
  z: number,
}

export type QuaternionMessage = {
  x: number,
  y: number,
  z: number,
  w: number,
}

export type NavPoint = {
  id: string,
  x: number,
  y: number,
  rotation: number,
}

// NavPath is a bezier line segment between two NavPoints
export type NavPath = {
  id: string
  start: NavPoint,
  end: NavPoint,
  controls: NavPoint[],
}
