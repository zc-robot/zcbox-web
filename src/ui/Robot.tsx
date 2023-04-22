import React from "react"
import { useAppDispatch } from "@/store"
import { zoom } from "@/store/grid"
import { Shape } from "react-konva"

interface RobotState {
  fill: string,
  x: number,
  y: number,
  width: number,
  scale: number,
  rotation: number,
}

const Robot: React.FC<RobotState> = ({ x, y, width, scale, rotation }) => {

  console.log("rotation", rotation)
  const points = [
    x - width / 2, y + width,
    x + width / 2, y + width,
    x, y - width
  ]


  return (
    <>
      <Shape
        x={x}
        y={y}
        scaleX={scale}
        scaleY={scale}
        rotation={rotation}
        sceneFunc={(context, shape) => {
          context.beginPath()
          context.moveTo(points[0], points[1])
          for (let i = 2; i < points.length; i += 2) {
            context.lineTo(points[i], points[i + 1])
          }
          context.closePath()
          context.fillStyle = "green"
          context.fill()
          context.stroke()
          context.fillStrokeShape(shape)
        }}
      />
    </>
  )
}

export default Robot
