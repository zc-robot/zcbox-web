export type TimeMessage = {
  sec: number,
  nanosec: number,
}

export type MapMetaDataMessage = {
  map_load_time?: TimeMessage,
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
