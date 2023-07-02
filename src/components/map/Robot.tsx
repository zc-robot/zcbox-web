import React from 'react'
import { Circle, Group, Line, Rect } from 'react-konva'
import { useParamsStore } from '@/store'
import type { FootprintParams, PoseMessage } from '@/types'
import { quaternionToCanvasAngle } from '@/util/transform'

interface RobotProp {
  pose: PoseMessage
}

const Robot: React.FC<RobotProp> = ({ pose }) => {
  const params = useParamsStore(state => state.robotParams)

  const x = pose.position.x
  const y = -pose.position.y
  const rotation = quaternionToCanvasAngle(pose.orientation)

  const robotShape = (footprint: FootprintParams) => {
    const robotCenterOffset = -footprint.nav_center2robot_center
    if (footprint.is_round) {
      return (
        <Group>
          <Circle
            x={x}
            y={y}
            radius={footprint.radius}
            stroke="green"
            strokeWidth={footprint.robot_width / 10} />
          <Circle
            x={x}
            y={y}
            offsetX={robotCenterOffset}
            radius={footprint.radius / 10}
            fill="red"
            rotation={rotation} />
          <Line
            x={x}
            y={y}
            offsetX={robotCenterOffset}
            points={[0, 0, footprint.radius, 0]}
            stroke="red"
            strokeWidth={footprint.robot_width / 10}
            rotation={rotation} />
        </Group>
      )
    }
    else {
      return (
        <Group>
          <Rect
            x={x}
            y={y}
            offsetX={footprint.robot_width / 2}
            offsetY={footprint.robot_length / 2}
            width={footprint.robot_width}
            height={footprint.robot_length}
            stroke="green"
            strokeWidth={footprint.robot_width / 10}
            // As the rotation of Konva is clockwise
            // we need to add 90 degrees to the rotation of the robot
            rotation={rotation + 90} />
          <Circle
            x={x}
            y={y}
            offsetX={robotCenterOffset}
            radius={footprint.robot_width / 10}
            fill="red"
            rotation={rotation} />
          <Line
            x={x}
            y={y}
            offsetX={robotCenterOffset}
            points={[0, 0, footprint.robot_length / 2, 0]}
            stroke="red"
            strokeWidth={footprint.robot_width / 10}
            rotation={rotation} />
        </Group>
      )
    }
  }

  return (
    <>
      {params && robotShape(params.robot_footprint)}
    </>
  )
}

export default Robot
