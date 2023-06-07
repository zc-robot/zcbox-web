import React, { useEffect, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import GridMap from './GridMap'
import Robot from './Robot'
import Waypoint from './Waypoint'
import Pathway from './Pathway'
import { useGridStore, useNavigationStore, useOperationStore } from '@/store'
import { quaternionToCanvasAngle } from '@/util/transform'
import { useElementSize, useKeyPress } from '@/hooks'

interface ImageState {
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number | null
}

const Monitor: React.FC = () => {
  const layerRef = useRef<Konva.Layer>(null)
  const [layerState, setLayerState] = useState<ImageState>()
  const [robotState, setRobotState] = useState<ImageState>()
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [containerRef, { width, height }] = useElementSize()
  const currentOp = useOperationStore(state => state.current)
  const updateOp = useOperationStore(state => state.updateOp)
  const selectedId = useOperationStore(state => state.selectedPointId)
  const selectPoint = useOperationStore(state => state.selectPoint)
  const scale = useGridStore(state => state.scale)
  const gridInfo = useGridStore(state => state.gridInfo)
  const poseMsg = useGridStore(state => state.pose)
  const wayPoints = useNavigationStore(state => state.points)
  const addWaypoint = useNavigationStore(state => state.addPoint)
  const removeWaypoint = useNavigationStore(state => state.removePoint)
  const pathways = useNavigationStore(state => state.paths)
  const addPathway = useNavigationStore(state => state.addPath)
  const removePathway = useNavigationStore(state => state.removePath)

  useKeyPress((_, isDown) => {
    if (!selectedId || !isDown)
      return

    if (selectedId.startsWith('Point')) {
      removeWaypoint(selectedId)
      selectPoint(null)
    }
    else if (selectedId.startsWith('Path')) {
      removePathway(selectedId)
      selectPoint(null)
    }
  }, ['Backspace'])

  useEffect(() => {
    const renderMap = () => {
      if (!gridInfo)
        return

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
      } as ImageState
      setLayerState(lp)

      if (!poseMsg)
        return
      const ap = {
        x: poseMsg.position.x,
        y: -poseMsg.position.y,
        scale: resolution,
        rotation: quaternionToCanvasAngle(poseMsg.orientation),
      } as ImageState
      setRobotState(ap)
    }
    renderMap()
  }, [gridInfo, poseMsg, scale])

  useEffect(() => {
    if (currentOp !== 'select')
      selectPoint(null)
  }, [currentOp, selectPoint])

  const handleLayerClick = (obj: Konva.KonvaEventObject<MouseEvent>) => {
    const layer = layerRef.current
    if (!layer || !gridInfo)
      return

    if (currentOp === 'select') {
      if (selectedId)
        selectPoint(null)
    }
    else if (currentOp === 'waypoint') {
      const x = (obj.evt.offsetX - layer.x()) * (gridInfo.resolution / scale)
      const y = (obj.evt.offsetY - layer.y()) * (gridInfo.resolution / scale)
      const id = addWaypoint({ x, y })
      selectPoint(id)
      updateOp('select')
    }
  }

  const handlePointClick = (id: string) => {
    if (currentOp === 'pathway') {
      if (!selectedId) {
        selectPoint(id)
      }
      else if (selectedId && selectedId !== id) {
        addPathway(selectedId, id)
        selectPoint(null)
        updateOp('select')
      }
    }
    else if (currentOp === 'select') {
      selectPoint(id)
    }
  }

  const handleLayerDrag = (obj: Konva.KonvaEventObject<DragEvent>) => {
    if (currentOp !== 'move')
      return

    const evt = obj.evt
    setOffset({ x: offset.x + evt.movementX, y: offset.y + evt.movementY })
  }

  return (
    <>
      <div flex-1
        className={currentOp === 'move' ? 'cursor-pointer' : ''}
        ref={containerRef}>
        <Stage
          width={width}
          height={height}>
          <Layer
            ref={layerRef}
            x={(layerState?.x ?? 0) + offset.x}
            y={(layerState?.y ?? 0) + offset.y}
            scaleX={layerState?.scale}
            scaleY={layerState?.scale}
            draggable={currentOp === 'move'}
            onDragMove={handleLayerDrag}
            onClick={handleLayerClick}>
            <GridMap />
            {poseMsg
              ? <Robot
                rotation={robotState?.rotation ?? 0}
                x={robotState?.x ?? 0}
                y={robotState?.y ?? 0}
                scale={robotState?.scale ?? 1}
                width={20} />
              : null
            }
            {pathways.map((path, i) => <Pathway
              key={i}
              path={path}
              scale={robotState?.scale ?? 1}
              onSelect={() => selectPoint(path.id)}
              isSelected={selectedId === path.id} />,
            )}
            {wayPoints.map((wp, i) => <Waypoint
              key={i}
              point={wp}
              scale={robotState?.scale ?? 1}
              width={15}
              onSelect={() => handlePointClick(wp.id)}
              isSelected={wp.id === selectedId} />)}
          </Layer>
        </Stage>
      </div>
    </>
  )
}

export default Monitor
