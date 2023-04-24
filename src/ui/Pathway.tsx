import { useNavigationStore } from "@/store"
import Konva from "konva"
import { useRef } from "react"
import { Circle, Group, Line } from "react-konva"

interface AnchorProp {
  x: number,
  y: number,
  scale: number
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void,
}

const Anchor: React.FC<AnchorProp> = ({ x, y, scale, onDragMove }) => {

  return (
    <Circle
      x={x}
      y={y}
      scale={{ x: scale, y: scale }}
      radius={3}
      fill="white"
      stroke="black"
      strokeWidth={1}
      draggable={true}
      onDragMove={onDragMove}
    />
  )
}

interface PathwayProps {
  id: string
  scale: number
  onSelect: () => void
  isSelected: boolean
}

const Pathway: React.FC<PathwayProps> = ({ id, scale, onSelect, isSelected }) => {
  const lineRef = useRef<Konva.Line>(null)
  const path = useNavigationStore((state) => state.path(id))
  const updatePath = useNavigationStore((state) => state.updatePath)

  const points = [
    path.start.x, path.start.y,
    path.controls[0].x, path.controls[0].y,
    path.controls[1].x, path.controls[1].y,
    path.end.x, path.end.y
  ]

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    onSelect()
  }

  const handleAnchor1DragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    points[2] = event.target.x()
    points[3] = event.target.y()
    updatePath(id, [{ x: points[2], y: points[3] }, { x: points[4], y: points[5] }])
  }

  const handleAnchor2DragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    points[4] = event.target.x()
    points[5] = event.target.y()
    updatePath(id, [{ x: points[2], y: points[3] }, { x: points[4], y: points[5] }])
  }

  return (
    <Group
      onClick={handleSelect}
      onTap={handleSelect}>
      <Line
        ref={lineRef}
        hitStrokeWidth={scale * 5}
        stroke={"black"}
        bezier={true}
        lineCap="round"
        lineJoin="round"
        strokeWidth={scale}
        points={points} />
      {isSelected && (
        <>
          <Anchor
            x={points[2]}
            y={points[3]}
            scale={scale}
            onDragMove={handleAnchor1DragMove} />
          <Anchor
            x={points[4]}
            y={points[5]}
            scale={scale}
            onDragMove={handleAnchor2DragMove} />
        </>
      )}
    </Group>

  )
}

export default Pathway
