import type Konva from 'konva'
import { useEffect, useMemo, useRef } from 'react'
import { Circle, Group, Line, RegularPolygon, Transformer } from 'react-konva'
import type { NavPoint } from '@/types'
import { useOperationStore, useParamsStore, useProfileStore } from '@/store'

interface WaypointProp {
  point: NavPoint
  onSelect: () => void
  isSelected: boolean
  isPathTarget?: boolean
  isPathSource?: boolean
}

const Waypoint: React.FC<WaypointProp> = ({
  point,
  onSelect,
  isSelected,
  isPathTarget = false,
  isPathSource = false,
}) => {
  const groupRef = useRef<Konva.Group>(null)
  const transformRef = useRef<Konva.Transformer>(null)
  const currentOp = useOperationStore(state => state.current)
  const params = useParamsStore(state => state.robotParams)
  const updateCurrentProfilePoint = useProfileStore(state => state.updateCurrentProfilePoint)

  const handleSelect = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true
    onSelect()
  }

  useEffect(() => {
    if (isSelected && transformRef.current && groupRef.current) {
      transformRef.current.nodes([groupRef.current])
      transformRef.current.getLayer()?.batchDraw()
      transformRef.current.forceUpdate()
    }
  }, [isSelected])

  const width = useMemo(() => {
    if (!params)
      return 0
    if (params.robot_footprint.is_round)
      return params.robot_footprint.radius / 5
    return params.robot_footprint.robot_width / 5
  }, [params])

  const fillColor = useMemo(() => {
    if (isPathTarget)
      return '#3B82F6'
    if (isPathSource)
      return '#2563EB'
    if (isSelected)
      return '#FF5722'
    return '#F59E0B'
  }, [isPathSource, isPathTarget, isSelected])

  const onDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    updateCurrentProfilePoint(point.uid, {
      x: event.currentTarget.x(),
      y: event.currentTarget.y(),
    })
  }

  const onTransformEnd = () => {
    const node = groupRef.current
    if (!node)
      return

    updateCurrentProfilePoint(point.uid, {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
    })
  }

  return (
    <>
      {params && (
        <Group
          ref={groupRef}
          x={point.x}
          y={point.y}
          rotation={point.rotation}
          draggable={isSelected && currentOp === 'select'}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          onClick={handleSelect}
          onTap={handleSelect}>
          <Circle
            radius={width * 0.95}
            fill="white"
            stroke={fillColor}
            strokeWidth={width * 0.25}
          />
          <Circle
            radius={width * 0.28}
            fill={fillColor}
          />
          <Line
            points={[0, 0, width * 1.45, 0]}
            stroke={fillColor}
            strokeWidth={width * 0.28}
            lineCap="round"
          />
          <RegularPolygon
            sides={3}
            radius={width * 0.52}
            x={width * 1.8}
            rotation={90}
            fill={fillColor}
          />
          {(isPathSource || isPathTarget) && (
            <Circle
              radius={width * 1.35}
              stroke={fillColor}
              strokeWidth={width * 0.12}
              dash={[width * 0.4, width * 0.25]}
            />
          )}
        </Group>
      )}
      {isSelected && currentOp === 'select' && (
        <Transformer
          ref={transformRef}
          rotateEnabled={true}
          resizeEnabled={false}
          borderEnabled={false}
          flipEnabled={false}
        />
      )}
    </>
  )
}

export default Waypoint
