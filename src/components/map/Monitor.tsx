import type Konva from 'konva'
import React, { useEffect, useRef, useState } from 'react'
import { Layer, Stage } from 'react-konva'
import { shallow } from 'zustand/shallow'
import GridMap from './GridMap'
import Pathway from './Pathway'
import Robot from './Robot'
import Waypoint from './Waypoint'
import { uid } from '@/util'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
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
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const [containerRef, { width, height }] = useElementSize()
  const { currentOp, updateOp, selectedId, selectPoint } = useOperationStore(state => ({
    currentOp: state.current,
    updateOp: state.updateOp,
    selectedId: state.selectedPointId,
    selectPoint: state.selectPoint,
  }), shallow)
  const { scale, gridInfo, robotInfo } = useGridStore(state => ({
    scale: state.scale,
    gridInfo: state.gridInfo,
    robotInfo: state.robotInfo,
  }), shallow)
  const {
    currentPoints, appendCurrentProfilePoint, removeCurrentProfilePoint,
    currentPaths, appendCurrentProfilePath, removeCurrentProfilePath, updateCurrentProfilePoint,
  } = useProfileStore(state => ({
    currentPoints: state.currentProfilePoints,
    appendCurrentProfilePoint: state.appendCurrentProfilePoint,
    removeCurrentProfilePoint: state.removeCurrentProfilePoint,
    currentPaths: state.currentProfilePaths,
    appendCurrentProfilePath: state.appendCurrentProfilePath,
    removeCurrentProfilePath: state.removeCurrentProfilePath,
    updateCurrentProfilePoint: state.updateCurrentProfilePoint,
  }), shallow)

  // if (currentPoints.length > 0)
  //   console.log('currentPoints', { x: currentPoints[0].x, y: currentPoints[0].y })

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
  }, [gridInfo, robotInfo, scale])

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
        const start = currentPoints().find(p => p.uid === selectedId)
        const end = currentPoints().find(p => p.uid === id)
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
    setOffset(prevState => ({
      x: prevState.x + evt.movementX,
      y: prevState.y + evt.movementY,
    }))
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
            {(gridInfo && robotInfo)
              && <Robot
                pose={robotInfo.pose} />
            }
            {currentPaths().map((path, i) => <Pathway
              key={i}
              path={path}
              onSelect={() => handlePathClick(path.uid)}
              isSelected={selectedId === path.uid} />,
            )}
            {currentPoints().map((wp, i) => <Waypoint
              key={i}
              point={wp}
              onSelect={() => handlePointClick(wp.uid)}
              isSelected={wp.uid === selectedId} />)}
          </Layer>
        </Stage>
      </div>
    </>
  )
}

export default Monitor
