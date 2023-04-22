import { useAppSelector, useAppDispatch } from "@/store"
import { addWaypoint, selectGridInfo, selectPoseMessage, selectScale, selectWayPoints } from "@/store/grid"
import { quaternionToAngle } from "@/util/transform"
import React, { useEffect, useRef, useState } from "react"
import { Layer, Stage, Arrow, Circle } from "react-konva"
import Konva from "konva"
import GridMap from "./GridMap"
import Robot from "./Robot"

const defaultMargin = { top: 50, right: 50, bottom: 50, left: 50 }

export interface PanelProps {
  width: number,
  height: number,
  margin?: { top: number; right: number; bottom: number; left: number },
}

interface ImageState {
  x: number,
  y: number,
  width?: number,
  height?: number,
  scale: number,
  rotation?: number,
}

const Monitor: React.FC<PanelProps> = ({ width, height }) => {
  const layerRef = useRef<Konva.Layer>(null)
  const dispatch = useAppDispatch()
  const scale = useAppSelector(selectScale)
  const gridInfo = useAppSelector(selectGridInfo)
  const poseMsg = useAppSelector(selectPoseMessage)
  const wayPoints = useAppSelector(selectWayPoints)
  const [layerState, setLayerState] = useState<ImageState>()
  const [robotState, setRobotState] = useState<ImageState>()

  useEffect(() => {
    const renderMap = () => {
      if (!gridInfo) return

      const resolution = gridInfo.resolution
      const imageX = gridInfo.origin.position.x
      const imageY = -(gridInfo.origin.position.y + gridInfo.height * resolution)

      // As the image scale is resolution, we need to scale the layer to 1/resolution
      const layerScale = scale / resolution
      const layerX = -imageX * layerScale
      const layerY = -imageY * layerScale
      const lp = {
        x: layerX,
        y: layerY,
        scale: layerScale,
      }
      console.log('layer:', lp)
      setLayerState(lp)

      if (!poseMsg) return
      const ap = {
        x: poseMsg.position.x,
        y: -poseMsg.position.y,
        scale: resolution,
        rotation: quaternionToAngle(poseMsg.orientation)
      }
      setRobotState(ap)
    }
    renderMap()
  }, [gridInfo, poseMsg, scale])

  const handleStageClick = (obj: Konva.KonvaEventObject<MouseEvent>) => {
    const layer = layerRef.current
    if (!layer || !gridInfo) return

    const x = (obj.evt.offsetX - layer.x()) * (gridInfo.resolution / scale)
    const y = (obj.evt.offsetY - layer.y()) * (gridInfo.resolution / scale)

    console.log({ x, y })
    dispatch(addWaypoint({ x, y }))
  }

  return (
    <>
      <Stage
        width={width}
        height={height}>
        <Layer
          ref={layerRef}
          x={layerState?.x}
          y={layerState?.y}
          scaleX={layerState?.scale}
          scaleY={layerState?.scale}
          draggable={true}
          onClick={handleStageClick}>
          <GridMap />
          {poseMsg ?
            <Robot
              fill="green"
              rotation={robotState?.rotation ?? 0}
              x={robotState?.x ?? 0}
              y={robotState?.y ?? 0}
              scale={robotState?.scale ?? 1}
              width={5} />
            : null
          }
          {wayPoints.map((wp, i) => {
            return <Circle
              fill="red"
              x={wp.position.x}
              y={wp.position.y}
              radius={3}
              scaleX={robotState?.scale}
              scaleY={robotState?.scale} />
          })}
        </Layer>
      </Stage>
    </>
  )
}

export default Monitor
