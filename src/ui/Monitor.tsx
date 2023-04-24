import { quaternionToCanvasAngle } from "@/util/transform"
import React, { useEffect, useRef, useState } from "react"
import { Layer, Stage } from "react-konva"
import Konva from "konva"
import GridMap from "./GridMap"
import Robot from "./Robot"
import Waypoint from "./Waypoint"
import { useGridStore, useNavigationStore } from "@/store"
import Pathway from "./Pathway"

export interface MonitorProps {
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

const Monitor: React.FC<MonitorProps> = ({ width, height }) => {
  const layerRef = useRef<Konva.Layer>(null)
  const [layerState, setLayerState] = useState<ImageState>()
  const [robotState, setRobotState] = useState<ImageState>()
  const [selectedId, setSelectedId] = useState<string>("")
  const [offset, setOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 })

  const scale = useGridStore((state) => state.scale)
  const gridInfo = useGridStore((state) => state.gridInfo)
  const poseMsg = useGridStore((state) => state.pose)
  const wayPoints = useNavigationStore((state) => state.points)
  const addWaypoint = useNavigationStore((state) => state.addPoint)
  const pathways = useNavigationStore((state) => state.paths)
  const addPathway = useNavigationStore((state) => state.addPath)

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
      setLayerState(lp)

      if (!poseMsg) return
      const ap = {
        x: poseMsg.position.x,
        y: -poseMsg.position.y,
        scale: resolution,
        rotation: quaternionToCanvasAngle(poseMsg.orientation)
      }

      setRobotState(ap)
    }
    renderMap()
  }, [gridInfo, poseMsg, scale])

  const handleLayerClick = (obj: Konva.KonvaEventObject<MouseEvent>) => {
    const layer = layerRef.current
    if (!layer || !gridInfo) return
    if (selectedId) {
      setSelectedId("")
      return
    }
    const x = (obj.evt.offsetX - layer.x()) * (gridInfo.resolution / scale)
    const y = (obj.evt.offsetY - layer.y()) * (gridInfo.resolution / scale)

    addWaypoint({ x, y })
  }

  const handleLayerDrag = (obj: Konva.KonvaEventObject<DragEvent>) => {
    const evt = obj.evt

    setOffset({ x: offset.x + evt.movementX, y: offset.y + evt.movementY })
  }

  return (
    <>
      <Stage
        width={width}
        height={height}>
        <Layer
          ref={layerRef}
          x={(layerState?.x ?? 0) + offset.x}
          y={(layerState?.y ?? 0) + offset.y}
          scaleX={layerState?.scale}
          scaleY={layerState?.scale}
          draggable={false}
          // onDragMove={handleLayerDrag}
          onClick={handleLayerClick}>
          <GridMap />
          {poseMsg ?
            <Robot
              rotation={robotState?.rotation ?? 0}
              x={robotState?.x ?? 0}
              y={robotState?.y ?? 0}
              scale={robotState?.scale ?? 1}
              width={5} />
            : null
          }
          {wayPoints.map((wp) => {
            return <Waypoint
              id={wp.id}
              key={wp.id}
              scale={robotState?.scale ?? 1}
              width={3}
              onSelect={() => {
                if (selectedId && selectedId !== wp.id) {
                  addPathway(selectedId, wp.id)
                  setSelectedId("")
                } else {
                  setSelectedId(wp.id)
                }
              }}
              isSelected={wp.id === selectedId} />
          })}
          {pathways.map((path) => <Pathway
            id={path.id}
            key={path.id}
            scale={robotState?.scale ?? 1}
            onSelect={() => setSelectedId(path.id)}
            isSelected={selectedId === path.id} />
          )}
        </Layer>
      </Stage>
    </>
  )
}

export default Monitor
