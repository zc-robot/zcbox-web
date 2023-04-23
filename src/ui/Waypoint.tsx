import { useNavigationStore } from "@/store"
import Konva from "konva"
import { useEffect, useRef } from "react"
import { Circle, Transformer, Arrow, Group } from "react-konva"

interface WaypointProp {
  id: string,
  width: number,
  scale: number,
  onSelect: () => void,
  isSelected: boolean,
}

const Waypoint: React.FC<WaypointProp> = ({ id, width, scale, onSelect, isSelected }) => {

  const shapeRef = useRef<Konva.Arrow>(null)
  const transformRef = useRef<Konva.Transformer>(null)
  const point = useNavigationStore((state) => state.point(id))
  const updatePoint = useNavigationStore((state) => state.updatePoint)

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

  return (
    <>
      <Group
        onClick={handleSelect}
        onTap={handleSelect}>
        <Arrow
          ref={shapeRef}
          x={point.x}
          y={point.y}
          points={[0, width / 2, 0, -width / 2]}
          pointerWidth={width}
          pointerLength={width * 2}
          hitStrokeWidth={width * 2}
          fill="red"
          scaleX={scale}
          scaleY={scale}
          rotation={point.rotation}
          onTransformEnd={(e) => {
            const node = shapeRef.current
            if (!node)
              return
            const rotation = node.rotation()
            node.rotate(0)
            updatePoint(id, {
              rotation: rotation,
            })
          }} />
        <Circle
          x={point.x}
          y={point.y}
          radius={width / 2}
          scaleX={scale}
          scaleY={scale}
          fill="red" />
      </Group>
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
