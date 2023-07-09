import type Konva from 'konva'
import { useEffect, useMemo, useRef } from 'react'
import { Arrow, Circle, Group, Transformer } from 'react-konva'
import type { NavPoint } from '@/types'
import { useParamsStore, useProfileStore } from '@/store'

interface WaypointProp {
  point: NavPoint
  onSelect: () => void
  isSelected: boolean
}

const Waypoint: React.FC<WaypointProp> = ({ point, onSelect, isSelected }) => {
  const groupRef = useRef<Konva.Group>(null)
  const shapeRef = useRef<Konva.Arrow>(null)
  const transformRef = useRef<Konva.Transformer>(null)
  const params = useParamsStore(state => state.robotParams)
  const updateCurrentProfilePoint = useProfileStore(state => state.updateCurrentProfilePoint)

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    onSelect()
  }

  useEffect(() => {
    if (isSelected && transformRef.current && shapeRef.current) {
      transformRef.current.nodes([shapeRef.current])
      transformRef.current.getLayer()?.batchDraw()
      transformRef.current.forceUpdate()
    }
  }, [isSelected])

  useEffect(() => {
    // NOTE: Reset position when params changed
    groupRef.current?.setPosition({ x: 0, y: 0 })
  }, [point])

  const width = useMemo(() => {
    if (!params)
      return 0
    if (params.robot_footprint.is_round)
      return params.robot_footprint.radius / 5
    else
      return params.robot_footprint.robot_width / 5
  }, [params])

  const onDragEnd = (obj: Konva.KonvaEventObject<DragEvent>) => {
    updateCurrentProfilePoint(point.uid, {
      x: point.x + obj.currentTarget.x(),
      y: point.y + obj.currentTarget.y(),
    })
  }

  return (
    <>
      {params && (
        <Group
          ref={groupRef}
          clearBeforeDraw={true}
          draggable={isSelected}
          onDragEnd={onDragEnd}
          onClick={handleSelect}
          onTap={handleSelect}>
          <Arrow
            ref={shapeRef}
            x={point.x}
            y={point.y}
            points={[-width / 2, 0, width / 2, 0]}
            pointerWidth={width}
            pointerLength={width * 2}
            hitStrokeWidth={width * 2}
            fill="red"
            rotation={point.rotation}
            onTransformEnd={() => {
              const node = shapeRef.current
              if (!node)
                return
              const rotation = node.rotation()
              node.rotate(0)
              updateCurrentProfilePoint(point.uid, {
                rotation,
              })
            }} />
          <Circle
            x={point.x}
            y={point.y}
            radius={width / 2}
            fill="red" />
        </Group>
      )}
      {isSelected && (
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
