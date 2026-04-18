import React from 'react'
import { Shape } from 'react-konva'
import type { LaserScanMessage, PoseMessage } from '@/types'

interface LaserScanProps {
  pose: PoseMessage
  scan: LaserScanMessage
  pointSize: number
}

const LaserScan: React.FC<LaserScanProps> = ({ pose, scan, pointSize }) => {
  return (
    <Shape
      listening={false}
      sceneFunc={(context, shape) => {
        const originX = pose.position.x
        const originY = -pose.position.y
        const baseAngle = pose.pyr.yaw + scan.angleMin

        context.fillStyle = 'rgba(14, 165, 233, 0.85)'

        for (let i = 0; i < scan.ranges.length; i++) {
          const range = scan.ranges[i]
          if (!Number.isFinite(range) || range < scan.rangeMin || range > scan.rangeMax)
            continue

          const angle = baseAngle + i * scan.angleIncrement
          const x = originX + range * Math.cos(angle)
          const y = originY - range * Math.sin(angle)
          context.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize)
        }

        context.fillStyle = 'rgba(249, 115, 22, 0.95)'
        context.beginPath()
        context.arc(originX, originY, 0.06, 0, Math.PI * 2)
        context.fill()

        context.fillStrokeShape(shape)
      }} />
  )
}

export default LaserScan
