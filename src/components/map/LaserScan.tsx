import React from 'react'
import { Shape } from 'react-konva'
import type { LaserScanMessage, PoseMessage } from '@/types'

interface LaserScanProps {
  pose: PoseMessage
  scan: LaserScanMessage
  pointSize: number
  color?: string
}

const LaserScan: React.FC<LaserScanProps> = ({ pose, scan, pointSize, color = 'rgba(14, 165, 233, 0.85)' }) => {
  return (
    <Shape
      listening={false}
      sceneFunc={(context, shape) => {
        const originX = pose.position.x
        const originY = -pose.position.y
        const yaw = pose.pyr.yaw

        context.fillStyle = color

        if (scan.transformApplied && scan.points?.length) {
          const cosYaw = Math.cos(yaw)
          const sinYaw = Math.sin(yaw)

          for (const point of scan.points) {
            const localX = point[0]
            const localY = point[1]
            const x = originX + localX * cosYaw - localY * sinYaw
            const y = originY - (localX * sinYaw + localY * cosYaw)
            context.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize)
          }
        }
        else {
          const baseAngle = yaw + scan.angleMin

          for (let i = 0; i < scan.ranges.length; i++) {
            const range = scan.ranges[i]
            if (!Number.isFinite(range) || range < scan.rangeMin || range > scan.rangeMax)
              continue

            const angle = baseAngle + i * scan.angleIncrement
            const x = originX + range * Math.cos(angle)
            const y = originY - range * Math.sin(angle)
            context.fillRect(x - pointSize / 2, y - pointSize / 2, pointSize, pointSize)
          }
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
