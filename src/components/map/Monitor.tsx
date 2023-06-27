import React, { useEffect, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import GridMap from './GridMap'
import Robot from './Robot'
import Waypoint from './Waypoint'
import Pathway from './Pathway'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
import { useElementSize, useKeyPress } from '@/hooks'
import { uid } from '@/util'

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
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [containerRef, { width, height }] = useElementSize()
  const currentOp = useOperationStore(state => state.current)
  const updateOp = useOperationStore(state => state.updateOp)
  const selectedId = useOperationStore(state => state.selectedPointId)
  const selectPoint = useOperationStore(state => state.selectPoint)
  const scale = useGridStore(state => state.scale)
  const gridInfo = useGridStore(state => state.gridInfo)
  const poseMsg = useGridStore(state => state.pose)
  const currentPoints = useProfileStore(state => state.currentProfilePoints())
  const appendCurrentProfilePoint = useProfileStore(state => state.appendCurrentProfilePoint)
  const removeCurrentProfilePoint = useProfileStore(state => state.removeCurrentProfilePoint)
  const currentPaths = useProfileStore(state => state.currentProfilePaths())
  const appendCurrentProfilePath = useProfileStore(state => state.appendCurrentProfilePath)
  const removeCurrentProfilePath = useProfileStore(state => state.removeCurrentProfilePath)

  useKeyPress((_, isDown) => {
    if (!selectedId || !isDown)
      return

    if (selectedId.startsWith('Point')) {
      removeCurrentProfilePoint(selectedId)
      selectPoint(null)
    }
    else if (selectedId.startsWith('Path')) {
      removeCurrentProfilePath(selectedId)
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
      const id = uid('Point')
      appendCurrentProfilePoint({
        x,
        y,
        name: `路径点 ${id.slice(-3)}`,
        uid: id,
        rotation: 0,
      })
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
        const start = currentPoints.find(p => p.uid === selectedId)
        const end = currentPoints.find(p => p.uid === id)
        if (!start || !end)
          return

        appendCurrentProfilePath({
          uid: uid('Path'),
          name: `路径 ${uid('Path').slice(-3)}`,
          start,
          end,
          controls: [
            { x: start.x + (end.x - start.x) / 4, y: start.y + (end.y - start.y) / 4 },
            { x: start.x + (end.x - start.x) / 4 * 3, y: start.y + (end.y - start.y) / 4 * 3 },
          ],
        })
        selectPoint(null)
        updateOp('select')
      }
    }
    else if (currentOp === 'select') {
      selectPoint(id)
    }
  }

  const handlePathClick = (id: string) => {
    if (currentOp === 'select')
      selectPoint(id)
  }

  const handleLayerDrag = (obj: Konva.KonvaEventObject<DragEvent>) => {
    if (currentOp !== 'move' || !layerState)
      return

    const evt = obj.evt
    setOffset({ x: offset.x + evt.movementX, y: offset.y + evt.movementY })
  }

  return (
    <>
      <div
        className={`flex-1 ${currentOp === 'move' ? 'cursor-pointer' : ''}`}
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
            {(gridInfo && poseMsg)
              && <Robot
                pose={poseMsg} />
            }
            {currentPaths.map((path, i) => <Pathway
              key={i}
              path={path}
              onSelect={() => handlePathClick(path.uid)}
              isSelected={selectedId === path.uid} />,
            )}
            {currentPoints.map((wp, i) => <Waypoint
              key={i}
              point={wp}
              scale={1}
              width={1}
              onSelect={() => handlePointClick(wp.uid)}
              isSelected={wp.uid === selectedId} />)}
          </Layer>
        </Stage>
      </div>
    </>
  )
}

export default Monitor
