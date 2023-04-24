import { OccupancyGridMessage, RobotInfoMessage } from "@/types"
import ky from 'ky'

class ApiServer {
  // domain = "http://localhost:1234"
  domain = "http://10.211.55.14:1234"
  client = ky.create({ prefixUrl: this.domain })

  // get_map
  fetchMap = async () => {
    const json = await this.client.get("get_map").json()
    return json as OccupancyGridMessage
  }

  // get_robot_data
  fetchRobotData = async () => {
    const json = await this.client.get("get_robot_data").json()
    return json as RobotInfoMessage
  }
}

export default new ApiServer
