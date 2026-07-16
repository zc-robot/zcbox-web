import ky from 'ky'
import { parseRobotNameResponse } from '@/util/robotConnection'

export async function fetchRobotName(robotIp: string) {
  const response = await ky.get(`http://${robotIp}:5000/getRobotName`, {
    retry: 0,
    timeout: 5000,
    headers: {
      'x-api-key': '1234567890',
    },
  })
  const body = await response.text()

  try {
    return parseRobotNameResponse(JSON.parse(body))
  }
  catch {
    return parseRobotNameResponse(body)
  }
}
