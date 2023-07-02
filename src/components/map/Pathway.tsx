import type Konva from 'konva'
import { useMemo, useRef } from 'react'
import { Circle, Group, Line } from 'react-konva'
import type { NavPath } from '@/types'
import { useParamsStore, useProfileStore } from '@/store'

interface AnchorProp {
  x: number
  y: number
  radius: number
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void
}

const Anchor: React.FC<AnchorProp> = ({ x, y, radius, onDragMove }) => {
  return (
    <Circle
      x={x}
      y={y}
      radius={radius}
      fill="white"
      stroke="black"
      strokeWidth={radius}
      draggable={true}
      onDragMove={onDragMove}
    />
  )
}

interface PathwayProps {
  path: NavPath
  onSelect: () => void
  isSelected: boolean
}

const Pathway: React.FC<PathwayProps> = ({ path, onSelect, isSelected }) => {
  const lineRef = useRef<Konva.Line>(null)
  const params = useParamsStore(state => state.robotParams)
  const updateCurrentProfilePath = useProfileStore(state => state.updateCurrentProfilePath)

  const points = [
    path.start.x, path.start.y,
    path.controls[0].x, path.controls[0].y,
    path.controls[1].x, path.controls[1].y,
    path.end.x, path.end.y,
  ]

  const width = useMemo(() => {
    if (!params)
      return 0
    if (params.robot_footprint.is_round)
      return params.robot_footprint.radius / 10
    else
      return params.robot_footprint.robot_width / 10
  }, [params])

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    onSelect()
  }

  const handleAnchor1DragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    points[2] = event.target.x()
    points[3] = event.target.y()
    updateCurrentProfilePath(path.uid, {
      controls: [
        { x: points[2], y: points[3] },
        { x: points[4], y: points[5] },
      ],
    })
  }

  const handleAnchor2DragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    points[4] = event.target.x()
    points[5] = event.target.y()
    updateCurrentProfilePath(path.uid, {
      controls: [
        { x: points[2], y: points[3] },
        { x: points[4], y: points[5] },
      ],
    })
  }

  return (
    <>
    {params && (
      <Group
        onClick={handleSelect}
        onTap={handleSelect}>
        <Line
          ref={lineRef}
          stroke={'black'}
          strokeWidth={width}
          hitStrokeWidth={width * 2}
          bezier={true}
          lineCap="round"
          lineJoin="round"
          points={points} />
        {isSelected && (
          <>
            <Anchor
              x={points[2]}
              y={points[3]}
              radius={width}
              onDragMove={handleAnchor1DragMove} />
            <Anchor
              x={points[4]}
              y={points[5]}
              radius={width}
              onDragMove={handleAnchor2DragMove} />
          </>
        )}
      </Group>
    )}
    </>
  )
}

export default Pathway
