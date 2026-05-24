import React from 'react'
import { Shape } from 'react-konva'
import type { PointCloudMessage, PointCloudPoint, PoseMessage } from '@/types'

interface PointCloudProps {
  cloud: PointCloudMessage
  robotPose: PoseMessage | null
  pointSize: number
}

function normalizeFrameId(frameId: string) {
  return frameId.replace(/^\/+/, '').toLowerCase()
}

function isWorldFrame(frameId: string) {
  const normalized = normalizeFrameId(frameId)
  return normalized === 'map'
    || normalized === 'odom'
    || normalized === 'world'
    || normalized.endsWith('/map')
    || normalized.endsWith('/odom')
}

function isOpticalFrame(frameId: string) {
  const normalized = normalizeFrameId(frameId)
  return normalized.includes('optical')
    || normalized.includes('camera')
    || normalized.includes('depth')
}

function getCanvasPoint(point: PointCloudPoint, isWorld: boolean, isOptical: boolean, robotPose: PoseMessage | null) {
  if (isWorld) {
    return {
      x: point[0],
      y: -point[1],
      height: point[2],
    }
  }

  if (!robotPose)
    return null

  const yaw = robotPose.pyr.yaw
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const forward = isOptical ? point[2] : point[0]
  const left = isOptical ? -point[0] : point[1]
  const height = isOptical ? -point[1] : point[2]
  const worldX = robotPose.position.x + forward * cos - left * sin
  const worldY = robotPose.position.y + forward * sin + left * cos

  return {
    x: worldX,
    y: -worldY,
    height,
  }
}

const PointCloud: React.FC<PointCloudProps> = ({ cloud, robotPose, pointSize }) => {
  return (
    <Shape
      listening={false}
      sceneFunc={(context, shape) => {
        const isWorld = isWorldFrame(cloud.frameId)
        const isOptical = isOpticalFrame(cloud.frameId)

        for (const point of cloud.points) {
          const canvasPoint = getCanvasPoint(point, isWorld, isOptical, robotPose)
          if (!canvasPoint)
            continue

          context.fillStyle = canvasPoint.height > 0.35
            ? 'rgba(249, 115, 22, 0.62)'
            : 'rgba(34, 197, 94, 0.58)'
          context.fillRect(
            canvasPoint.x - pointSize / 2,
            canvasPoint.y - pointSize / 2,
            pointSize,
            pointSize,
          )
        }

        context.fillStrokeShape(shape)
      }} />
  )
}

export default PointCloud
