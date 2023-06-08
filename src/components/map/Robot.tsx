import React from 'react'
import { Circle, Shape } from 'react-konva'

interface RobotProp {
  x: number
  y: number
  width: number
  scale: number
  rotation: number
}

const Robot: React.FC<RobotProp> = ({ x, y, width, scale, rotation }) => {
  const points = [
    -width, width / 2,
    width, 0,
    -width, -width / 2,
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
          for (let i = 2; i < points.length; i += 2)
            context.lineTo(points[i], points[i + 1])

          context.closePath()
          context.fillStyle = 'green'
          context.fill()
          context.stroke()
          context.fillStrokeShape(shape)
        }}
      />
      <Circle
        x={x}
        y={y}
        radius={width / 4}
        fill="red"
        scaleX={scale}
        scaleY={scale}
      />
    </>
  )
}

export default Robot
