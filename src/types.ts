export type OccupancyGridMessage = {
  header: {
    stamp: {
      sec: number,
      nanosec: number,
    },
    frame_id: string,
  },
  info: {
    map_load_time: {
      sec: number,
      nanosec: number,
    },
    resolution: number,
    width: number,
    height: number,
    origin: {
      position: {
        x: number,
        y: number,
        z: number,
      },
      orientation: {
        x: number,
        y: number,
        z: number,
        w: number,
      },
    },
  },
  data: number[],
}
