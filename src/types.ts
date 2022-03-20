export type OccupancyGridMessage = {
  header: {
    seq: number,
    stamp: {
      secs: number,
      nsecs: number,
    },
    frame_id: string,
  },
  info: {
    map_load_time: {
      secs: number,
      nsecs: number,
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
