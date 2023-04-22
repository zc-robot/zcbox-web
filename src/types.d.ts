export type MapMetaDataMessage = {
  resolution: number,
  width: number,
  height: number,
  origin: PoseMessage,
}

export type OccupancyGridMessage = {
  header?: {
    stamp: TimeMessage,
    frame_id: string,
  },
  info: MapMetaDataMessage,
  data: number[],
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

export type NavPath = {
  x: number,
  y: number,
}
