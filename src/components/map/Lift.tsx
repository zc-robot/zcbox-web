import type Konva from 'konva'
import { useEffect, useRef } from 'react'
import { Group, Rect, Text, Transformer } from 'react-konva'
import type { NavLift } from '@/types'
import { useOperationStore, useProfileStore } from '@/store'

interface LiftProps {
  lift: NavLift
  onSelect: (event: Konva.KonvaEventObject<MouseEvent>) => void
  isSelected: boolean
}

const Lift: React.FC<LiftProps> = ({ lift, onSelect, isSelected }) => {
  const groupRef = useRef<Konva.Group>(null)
  const transformRef = useRef<Konva.Transformer>(null)
  const currentOp = useOperationStore(state => state.current)
  const updateCurrentProfileLift = useProfileStore(state => state.updateCurrentProfileLift)

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
    updateCurrentProfileLift(lift.uid, {
      x: event.currentTarget.x(),
      y: event.currentTarget.y(),
    })
  }

  const onTransformEnd = () => {
    const node = groupRef.current
    if (!node)
      return

    const nextWidth = Math.max(1, Number((lift.width * node.scaleX()).toFixed(2)))
    const nextDepth = Math.max(1, Number((lift.depth * node.scaleY()).toFixed(2)))
    node.scaleX(1)
    node.scaleY(1)

    updateCurrentProfileLift(lift.uid, {
      x: Number(node.x().toFixed(2)),
      y: Number(node.y().toFixed(2)),
      rotation: Number(node.rotation().toFixed(2)),
      width: nextWidth,
      depth: nextDepth,
    })
  }

  const editable = isSelected && (currentOp === 'select' || currentOp === 'lift')

  return (
    <>
      <Group
        ref={groupRef}
        x={lift.x}
        y={lift.y}
        rotation={lift.rotation}
        draggable={editable}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
        onClick={handleSelect}
        onTap={handleSelect}>
        <Rect
          x={-lift.width / 2}
          y={-lift.depth / 2}
          width={lift.width}
          height={lift.depth}
          cornerRadius={0.16}
          fill="rgba(37, 99, 235, 0.18)"
          stroke="#1D4ED8"
          strokeWidth={0.08}
        />
        <Rect
          x={-lift.width / 2 + 0.18}
          y={-lift.depth / 2 + 0.18}
          width={Math.max(0.3, lift.width - 0.36)}
          height={Math.max(0.3, lift.depth - 0.36)}
          cornerRadius={0.12}
          stroke="#1D4ED8"
          dash={[0.18, 0.12]}
          strokeWidth={0.05}
        />
        <Text
          x={-lift.width / 2}
          y={-0.18}
          width={lift.width}
          align="center"
          fontSize={0.3}
          fontStyle="bold"
          fill="#1E3A8A"
          text="LIFT"
        />
      </Group>
      {editable && (
        <Transformer
          ref={transformRef}
          rotateEnabled={true}
          resizeEnabled={true}
          borderEnabled={false}
          flipEnabled={false}
          keepRatio={false}
        />
      )}
    </>
  )
}

export default Lift
