import { OccupancyGridMessage, PoseMessage } from "@/types"
import ky from 'ky'

class ApiServer {
  // domain = "http://localhost:1234"
  domain = "http://10.211.55.14:1234"

  // get_map
  fetchMap = async () => {
    const json = await ky.get(this.domain + "/get_map").json()
    return json as OccupancyGridMessage
  }

  // get_robot_data
  fetchRobotData = async () => {
    const json = await ky.get(this.domain + "get_robot_data").json()
    return json as PoseMessage
  }
}

export default new ApiServer
