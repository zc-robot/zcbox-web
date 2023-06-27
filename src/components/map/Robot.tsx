import React from 'react'
import { Circle, Group, Line, Rect } from 'react-konva'
import { useParamsStore } from '@/store'
import type { FootprintParams, PoseMessage } from '@/types'
import { quaternionToCanvasAngle } from '@/util/transform'

interface RobotProp {
  pose: PoseMessage
}

const Robot: React.FC<RobotProp> = ({ pose }) => {
  const params = useParamsStore(state => state.params)

  const x = pose.position.x
  const y = -pose.position.y
  const rotation = quaternionToCanvasAngle(pose.orientation)

  const robotShape = (footprint: FootprintParams) => {
    if (footprint.is_round) {
      return (
        <Group
          rotation={rotation}>
          <Circle
            x={x}
            y={y}
            radius={footprint.radius}
            stroke="green"
            strokeWidth={footprint.robot_width / 10} />
          <Circle
            x={x}
            y={y - footprint.nav_center2robot_center}
            radius={footprint.robot_width / 10}
            fill="red" />
          <Line
            points={[x, y - footprint.nav_center2robot_center, x + footprint.robot_length / 2, y - footprint.nav_center2robot_center]}
            stroke="red"
            strokeWidth={footprint.robot_width / 10} />
        </Group>
      )
    }
    else {
      return (
        <Group
          rotation={rotation}>
          <Rect
            x={x}
            y={y}
            offsetX={footprint.robot_width / 2}
            offsetY={footprint.robot_length / 2}
            width={footprint.robot_width}
            height={footprint.robot_length}
            stroke="green"
            strokeWidth={footprint.robot_width / 10}
            rotation={90} />
          <Circle
            x={x}
            y={y - footprint.nav_center2robot_center}
            radius={footprint.robot_width / 10}
            fill="red" />
          <Line
            points={[x, y - footprint.nav_center2robot_center, x + footprint.robot_length / 2, y - footprint.nav_center2robot_center]}
            stroke="red"
            strokeWidth={footprint.robot_width / 10} />
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
