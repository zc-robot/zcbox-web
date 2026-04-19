import type Konva from 'konva'
import { useEffect, useMemo, useRef } from 'react'
import { Circle, Group, Line, Rect, Text, Transformer } from 'react-konva'
import type { NavPoint } from '@/types'
import { useOperationStore, useParamsStore, useProfileStore } from '@/store'

interface WaypointProp {
  point: NavPoint
  onSelect: (event: Konva.KonvaEventObject<MouseEvent>) => void
  isSelected: boolean
  isPrimarySelected: boolean
  isPathTarget?: boolean
  isPathSource?: boolean
}

const Waypoint: React.FC<WaypointProp> = ({
  point,
  onSelect,
  isSelected,
  isPrimarySelected,
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
    onSelect(event)
  }

  useEffect(() => {
    if (isPrimarySelected && transformRef.current && groupRef.current) {
      transformRef.current.nodes([groupRef.current])
      transformRef.current.getLayer()?.batchDraw()
      transformRef.current.forceUpdate()
    }
  }, [isPrimarySelected])

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
          draggable={isPrimarySelected && currentOp === 'select'}
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
            points={[width * 0.18, 0, width * 0.72, 0]}
            stroke={fillColor}
            strokeWidth={width * 0.28}
            lineCap="round"
          />
          <Line
            points={[
              width * 0.62, -width * 0.24,
              width * 1.08, 0,
              width * 0.62, width * 0.24,
            ]}
            fill={fillColor}
            closed
          />
          {(isPathSource || isPathTarget) && (
            <Circle
              radius={width * 1.35}
              stroke={fillColor}
              strokeWidth={width * 0.12}
              dash={[width * 0.4, width * 0.25]}
            />
          )}
          {point.is_charger && (
            <Group
              x={width * 1.45}
              y={-width * 1.1}
              rotation={-point.rotation}>
              <Rect
                x={-width * 0.42}
                y={-width * 0.28}
                width={width * 0.84}
                height={width * 0.56}
                cornerRadius={width * 0.08}
                fill="#16A34A"
                stroke="white"
                strokeWidth={width * 0.08}
              />
              <Rect
                x={width * 0.42}
                y={-width * 0.12}
                width={width * 0.14}
                height={width * 0.24}
                cornerRadius={width * 0.04}
                fill="#16A34A"
                stroke="white"
                strokeWidth={width * 0.04}
              />
              <Line
                points={[
                  -width * 0.15, -width * 0.12,
                  0, -width * 0.12,
                  -width * 0.06, width * 0.14,
                  width * 0.14, width * 0.14,
                ]}
                stroke="white"
                strokeWidth={width * 0.08}
                lineCap="round"
                lineJoin="round"
              />
            </Group>
          )}
          {point.is_parking_spot && (
            <Group
              x={point.is_charger ? width * 2.35 : width * 1.45}
              y={-width * 1.1}
              rotation={-point.rotation}>
              <Circle
                radius={width * 0.42}
                fill="#2563EB"
                stroke="white"
                strokeWidth={width * 0.08}
              />
              <Text
                x={-width * 0.18}
                y={-width * 0.26}
                width={width * 0.36}
                align="center"
                fontSize={width * 0.52}
                fontStyle="bold"
                fill="white"
                text="P"
              />
            </Group>
          )}
        </Group>
      )}
      {isPrimarySelected && currentOp === 'select' && (
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
