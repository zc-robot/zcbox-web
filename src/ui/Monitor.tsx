import { quaternionToCanvasAngle } from "@/util/transform"
import React, { useEffect, useRef, useState } from "react"
import { Layer, Stage } from "react-konva"
import Konva from "konva"
import GridMap from "./GridMap"
import Robot from "./Robot"
import Waypoint from "./Waypoint"
import { useGridStore, useNavigationStore, useOperationStore } from "@/store"
import Pathway from "./Pathway"
import { useKeyPress } from "@/util/hooks"

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

  const currentOp = useOperationStore((state) => state.current)
  const updateOp = useOperationStore((state) => state.update)
  const scale = useGridStore((state) => state.scale)
  const gridInfo = useGridStore((state) => state.gridInfo)
  const poseMsg = useGridStore((state) => state.pose)
  const wayPoints = useNavigationStore((state) => state.points)
  const addWaypoint = useNavigationStore((state) => state.addPoint)
  const removeWaypoint = useNavigationStore((state) => state.removePoint)
  const pathways = useNavigationStore((state) => state.paths)
  const addPathway = useNavigationStore((state) => state.addPath)
  const removePathway = useNavigationStore((state) => state.removePath)

  useKeyPress(() => {
    if (!selectedId) return

    if (selectedId.startsWith("point")) {
      removeWaypoint(selectedId)
      setSelectedId("")
    } else if (selectedId.startsWith("path")) {
      removePathway(selectedId)
      setSelectedId("")
    }
  }, ["Backspace"])

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

  useEffect(() => {
    if (currentOp !== "select") {
      setSelectedId("")
    }
  }, [currentOp])

  const handleLayerClick = (obj: Konva.KonvaEventObject<MouseEvent>) => {
    const layer = layerRef.current
    if (!layer || !gridInfo) return

    if (currentOp === "select") {
      if (selectedId) {
        setSelectedId("")
        return
      }
    } else if (currentOp === "waypoint") {
      const x = (obj.evt.offsetX - layer.x()) * (gridInfo.resolution / scale)
      const y = (obj.evt.offsetY - layer.y()) * (gridInfo.resolution / scale)
      const id = addWaypoint({ x, y })
      setSelectedId(id)
      updateOp("select")
    }
  }

  const handlePointClick = (id: string) => {
    if (currentOp === "pathway") {
      if (!selectedId) {
        setSelectedId(id)
      } else if (selectedId && selectedId !== id) {
        addPathway(selectedId, id)
        setSelectedId("")
        updateOp("select")
      }
    } else if (currentOp === "select") {
      setSelectedId(id)
    }
  }

  const handleLayerDrag = (obj: Konva.KonvaEventObject<DragEvent>) => {
    if (currentOp !== "move") return

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
          draggable={currentOp === "move"}
          onDragMove={handleLayerDrag}
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
          {pathways.map((path) => <Pathway
            key={path.id}
            path={path}
            scale={robotState?.scale ?? 1}
            onSelect={() => setSelectedId(path.id)}
            isSelected={selectedId === path.id} />
          )}
          {wayPoints.map((wp) => <Waypoint
            key={wp.id}
            point={wp}
            scale={robotState?.scale ?? 1}
            width={3}
            onSelect={() => handlePointClick(wp.id)}
            isSelected={wp.id === selectedId} />)}
        </Layer>
      </Stage>
    </>
  )
}

export default Monitor
