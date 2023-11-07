import { Circle } from 'react-konva'
import { useMemo } from 'react'
import type { PointMessage } from '@/types'
import { useParamsStore } from '@/store'

interface PathPointProp {
  point: PointMessage
}

const PathPoint: React.FC<PathPointProp> = ({ point }) => {
  const params = useParamsStore(state => state.robotParams)

  const width = useMemo(() => {
    if (!params)
      return 0
    if (params.robot_footprint.is_round)
      return params.robot_footprint.radius / 10
    else
      return params.robot_footprint.robot_width / 10
  }, [params])

  return (<Circle
    x={point.x}
    y={point.y}
    radius={width}
    stroke="red"
    strokeWidth={width} />)
}

export default PathPoint
