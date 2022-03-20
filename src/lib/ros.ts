import ROSLIB from "roslib"
import { store } from "src/store"
import { updateMessage } from "src/store/grid"
import { OccupancyGridMessage } from "src/types"

class RosClient {
  private ros: ROSLIB.Ros | null = null

  connect = (url: string) => {
    this.ros = new ROSLIB.Ros({
      url: url,
    })
    this.ros.on("connection", () => {
      console.log("Connected to websocket server.")
    })
    this.ros.on("error", (error) => {
      console.error(error)
    })
  }

  subscribeMap = () => {
    if (!this.ros || !this.ros.isConnected) return

    const topic = new ROSLIB.Topic({
      ros: this.ros,
      name: "/map",
      messageType: "nav_msgs/OccupancyGrid",
      compression: "png",
    })
    topic.subscribe((message) => {
      let msg = message as OccupancyGridMessage
      store.dispatch(updateMessage(msg))
    })
  }
}

export default new RosClient()
