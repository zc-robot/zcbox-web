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
  x: number
  y: number
  points: number[]
  scale: number
  onSelect: () => void
  isSelected: boolean
}

const Pathway: React.FC<PathwayProps> = ({ x, y, points, scale, onSelect, isSelected }) => {
  const lineRef = useRef<Konva.Line>(null)

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    onSelect()
  }

  const handleAnchor1DragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    const evt = event.evt
    console.log(evt.offsetX, evt.offsetY)

    const line = lineRef.current
    if (line) {
      const newPoints = [...points]
      newPoints[2] = event.target.x()
      newPoints[3] = event.target.y()
      line.points(newPoints)
    }
  }

  const handleAnchor2DragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    const line = lineRef.current
    if (line) {
      const newPoints = [...points]
      newPoints[4] = event.target.x()
      newPoints[5] = event.target.y()
      line.points(newPoints)
    }
  }

  return (
    <Group
      onClick={handleSelect}
      onTap={handleSelect}>
      <Line
        ref={lineRef}
        x={x}
        y={y}
        hitStrokeWidth={scale * 5}
        stroke={"black"}
        strokeWidth={scale}
        points={points} />
      {isSelected && (
        <>
          <Anchor
            x={x + points[0]}
            y={y + points[1]}
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
