import type Konva from 'konva'
import { useEffect, useRef } from 'react'
import { Group, Line, Rect, Text, Transformer } from 'react-konva'
import type { NavDoor } from '@/types'
import { useOperationStore, useProfileStore } from '@/store'

interface DoorProps {
  door: NavDoor
  onSelect: (event: Konva.KonvaEventObject<MouseEvent>) => void
  isSelected: boolean
}

const doorThickness = 0.16

const Door: React.FC<DoorProps> = ({ door, onSelect, isSelected }) => {
  const groupRef = useRef<Konva.Group>(null)
  const transformRef = useRef<Konva.Transformer>(null)
  const currentOp = useOperationStore(state => state.current)
  const updateCurrentProfileDoor = useProfileStore(state => state.updateCurrentProfileDoor)

  const handleSelect = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true
    onSelect(event)
  }

  useEffect(() => {
    if (isSelected && transformRef.current && groupRef.current) {
      transformRef.current.nodes([groupRef.current])
      transformRef.current.getLayer()?.batchDraw()
      transformRef.current.forceUpdate()
    }
  }, [isSelected])

  const onDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    updateCurrentProfileDoor(door.uid, {
      x: event.currentTarget.x(),
      y: event.currentTarget.y(),
    })
  }

  const onTransformEnd = () => {
    const node = groupRef.current
    if (!node)
      return

    const nextWidth = Math.max(0.6, Number((door.width * node.scaleX()).toFixed(2)))
    node.scaleX(1)
    node.scaleY(1)

    updateCurrentProfileDoor(door.uid, {
      x: Number(node.x().toFixed(2)),
      y: Number(node.y().toFixed(2)),
      rotation: Number(node.rotation().toFixed(2)),
      width: nextWidth,
    })
  }

  const isSliding = door.door_type.includes('sliding')
  const accentColor = isSliding ? '#2563EB' : '#F97316'
  const indicatorText = isSliding ? 'S' : 'H'
  const editable = isSelected && (currentOp === 'select' || currentOp === 'door')

  return (
    <>
      <Group
        ref={groupRef}
        x={door.x}
        y={door.y}
        rotation={door.rotation}
        draggable={editable}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
        onClick={handleSelect}
        onTap={handleSelect}>
        <Rect
          x={-door.width / 2}
          y={-doorThickness / 2}
          width={door.width}
          height={doorThickness}
          cornerRadius={doorThickness / 2}
          fill="white"
          stroke={accentColor}
          strokeWidth={0.06}
        />
        <Line
          points={[-door.width / 2, 0, door.width / 2, 0]}
          stroke={accentColor}
          strokeWidth={0.05}
          lineCap="round"
        />
        {isSliding
          ? (
              <>
                <Line
                  points={[-door.width * 0.18, -doorThickness * 0.9, -door.width * 0.02, -doorThickness * 0.9]}
                  stroke={accentColor}
                  strokeWidth={0.04}
                  lineCap="round"
                />
                <Line
                  points={[-door.width * 0.08, -doorThickness * 1.1, -door.width * 0.02, -doorThickness * 0.9, -door.width * 0.08, -doorThickness * 0.7]}
                  stroke={accentColor}
                  strokeWidth={0.04}
                  lineCap="round"
                  lineJoin="round"
                />
                <Line
                  points={[door.width * 0.18, doorThickness * 0.9, door.width * 0.02, doorThickness * 0.9]}
                  stroke={accentColor}
                  strokeWidth={0.04}
                  lineCap="round"
                />
                <Line
                  points={[door.width * 0.08, doorThickness * 1.1, door.width * 0.02, doorThickness * 0.9, door.width * 0.08, doorThickness * 0.7]}
                  stroke={accentColor}
                  strokeWidth={0.04}
                  lineCap="round"
                  lineJoin="round"
                />
              </>
            )
          : (
              <Line
                points={[-door.width * 0.35, 0, -door.width * 0.15, -door.width * 0.2, door.width * 0.1, -door.width * 0.2]}
                stroke={accentColor}
                strokeWidth={0.04}
                lineCap="round"
                lineJoin="round"
              />
            )}
        <Text
          x={-0.16}
          y={-doorThickness * 2.15}
          width={0.32}
          align="center"
          fontSize={0.22}
          fontStyle="bold"
          fill={accentColor}
          text={indicatorText}
        />
      </Group>
      {editable && (
        <Transformer
          ref={transformRef}
          rotateEnabled={true}
          resizeEnabled={true}
          enabledAnchors={['middle-left', 'middle-right']}
          borderEnabled={false}
          flipEnabled={false}
          keepRatio={false}
        />
      )}
    </>
  )
}

export default Door
