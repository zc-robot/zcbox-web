import type Konva from 'konva'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Line, Stage } from 'react-konva'
import { shallow } from 'zustand/shallow'
import GridMap from './GridMap'
import LaserScan from './LaserScan'
import Pathway from './Pathway'
import RelocalizationRobot from './RelocalizationRobot'
import Robot from './Robot'
import Waypoint from './Waypoint'
import PathPoint from './PathPoint'
import { uid } from '@/util'
import { useGridStore, useOperationStore, useParamsStore, useProfileStore } from '@/store'
import { useElementSize, useKeyPress } from '@/hooks'
import { composePose, getRelativePose } from '@/util/transform'
import type { NavPoint, PoseMessage } from '@/types'

interface ImageState {
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number | null
}

function getLayerState(resolution: number, imageX: number, imageY: number, scale: number): ImageState {
  const layerScale = scale / resolution
  return {
    x: -imageX * layerScale,
    y: -imageY * layerScale,
    scale: layerScale,
  } as ImageState
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return element != null && (
    element.tagName === 'INPUT'
    || element.tagName === 'TEXTAREA'
    || element.isContentEditable
  )
}

const Monitor: React.FC = () => {
  const layerRef = useRef<Konva.Layer>(null)
  const lastHandledCenterRequestId = useRef(0)
  const relocalizationLaserOffset = useRef<PoseMessage | null>(null)
  const [layerState, setLayerState] = useState<ImageState>()
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [draftPath, setDraftPath] = useState<{ startId: string; x: number; y: number } | null>(null)
  const [draftPathTargetId, setDraftPathTargetId] = useState<string | null>(null)
  const [containerRef, { width, height }] = useElementSize()

  const { currentOp, updateOp, selectedId, selectedPointIds, selectPoint, selectPoints, togglePointSelection, openPointEditor } = useOperationStore(state => ({
    currentOp: state.current,
    updateOp: state.updateOp,
    selectedId: state.selectedPointId,
    selectedPointIds: state.selectedPointIds,
    selectPoint: state.selectPoint,
    selectPoints: state.selectPoints,
    togglePointSelection: state.togglePointSelection,
    openPointEditor: state.openPointEditor,
  }), shallow)
  const { scale, gridInfo, robotInfo, pathPointInfo, isScanVisible, laserPose, laserScan, scanPointSize, centerRobotRequestId, relocalizationPose, updateRelocalizationPose, cancelRelocalization } = useGridStore(state => ({
    scale: state.scale,
    gridInfo: state.gridInfo,
    robotInfo: state.robotInfo,
    pathPointInfo: state.pathPointInfo,
    isScanVisible: state.isScanVisible,
    laserPose: state.laserPose,
    laserScan: state.laserScan,
    scanPointSize: state.scanPointSize,
    centerRobotRequestId: state.centerRobotRequestId,
    relocalizationPose: state.relocalizationPose,
    updateRelocalizationPose: state.updateRelocalizationPose,
    cancelRelocalization: state.cancelRelocalization,
  }), shallow)
  const robotParams = useParamsStore(state => state.robotParams)
  const {
    currentProfileId, currentPoints, appendCurrentProfilePoint, updateCurrentProfilePoints, removeCurrentProfilePoint,
    currentPaths, appendCurrentProfilePath, removeCurrentProfilePath,
  } = useProfileStore(state => ({
    currentProfileId: state.currentProfileId,
    currentPoints: state.currentProfilePoints,
    appendCurrentProfilePoint: state.appendCurrentProfilePoint,
    updateCurrentProfilePoints: state.updateCurrentProfilePoints,
    removeCurrentProfilePoint: state.removeCurrentProfilePoint,
    currentPaths: state.currentProfilePaths,
    appendCurrentProfilePath: state.appendCurrentProfilePath,
    removeCurrentProfilePath: state.removeCurrentProfilePath,
  }), shallow)

  const pathStrokeWidth = useMemo(() => {
    if (!robotParams)
      return 0.1
    if (robotParams.robot_footprint.is_round)
      return Math.max(robotParams.robot_footprint.radius / 10, 0.1)
    return Math.max(robotParams.robot_footprint.robot_width / 10, 0.1)
  }, [robotParams])

  const pathSnapDistance = useMemo(() => Math.max(pathStrokeWidth * 5, 0.35), [pathStrokeWidth])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    if (selectedPointIds.length > 0) {
      event.preventDefault()
      selectedPointIds.forEach(id => removeCurrentProfilePoint(id))
      selectPoint(null)
      return
    }

    if (!selectedId)
      return

    event.preventDefault()

    if (selectedId.startsWith('Path')) {
      removeCurrentProfilePath(selectedId)
      selectPoint(null)
    }
  }, ['Backspace', 'Delete'])

  useKeyPress((event, isDown) => {
    if (!isDown || currentOp !== 'select' || selectedPointIds.length < 2 || isEditableTarget(event.target))
      return

    const pointMap = new Map(currentPoints().map(point => [point.uid, point]))
    const selectedPoints = selectedPointIds
      .map(id => pointMap.get(id))
      .filter((point): point is NavPoint => point != null)

    if (selectedPoints.length < 2)
      return

    let start = selectedPoints[0]
    let end = selectedPoints[selectedPoints.length - 1]
    let maxDistance = Math.hypot(end.x - start.x, end.y - start.y)

    if (maxDistance < 1e-6) {
      selectedPoints.forEach((pointA, indexA) => {
        selectedPoints.slice(indexA + 1).forEach((pointB) => {
          const distance = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y)
          if (distance > maxDistance) {
            start = pointA
            end = pointB
            maxDistance = distance
          }
        })
      })
    }

    if (maxDistance < 1e-6)
      return

    const vector = {
      x: end.x - start.x,
      y: end.y - start.y,
    }
    const vectorLengthSquared = vector.x ** 2 + vector.y ** 2
    const interior = selectedPoints
      .filter(point => point.uid !== start.uid && point.uid !== end.uid)
      .sort((pointA, pointB) => {
        const projectionA = ((pointA.x - start.x) * vector.x + (pointA.y - start.y) * vector.y) / vectorLengthSquared
        const projectionB = ((pointB.x - start.x) * vector.x + (pointB.y - start.y) * vector.y) / vectorLengthSquared
        return projectionA - projectionB
      })
    const orderedPoints = [start, ...interior, end]
    const updates = orderedPoints.map((point, index) => {
      const ratio = index / (orderedPoints.length - 1)
      return {
        uid: point.uid,
        point: {
          x: start.x + vector.x * ratio,
          y: start.y + vector.y * ratio,
        },
      }
    })

    event.preventDefault()
    updateCurrentProfilePoints(updates)
    selectPoints(orderedPoints.map(point => point.uid), end.uid)
  }, ['/'])

  useEffect(() => {
    const renderMap = () => {
      if (!gridInfo)
        return

      const resolution = gridInfo.resolution
      const imageX = gridInfo.origin.position.x
      const imageY = -(gridInfo.origin.position.y + gridInfo.height * resolution)

      // As the image scale is resolution, we need to scale the layer to 1/resolution
      setLayerState(getLayerState(resolution, imageX, imageY, scale))
    }
    renderMap()
  }, [gridInfo, scale])

  useEffect(() => {
    if (!gridInfo || !robotInfo || !width || !height)
      return
    if (centerRobotRequestId <= lastHandledCenterRequestId.current)
      return

    const resolution = gridInfo.resolution
    const imageX = gridInfo.origin.position.x
    const imageY = -(gridInfo.origin.position.y + gridInfo.height * resolution)
    const nextLayerState = getLayerState(resolution, imageX, imageY, scale)

    setOffset({
      x: width / 2 - (nextLayerState.x + robotInfo.pose.position.x * nextLayerState.scale),
      y: height / 2 - (nextLayerState.y + -robotInfo.pose.position.y * nextLayerState.scale),
    })
    lastHandledCenterRequestId.current = centerRobotRequestId
  }, [centerRobotRequestId, gridInfo, height, robotInfo, scale, width])

  useEffect(() => {
    if (currentOp !== 'select')
      selectPoint(null)
  }, [currentOp, selectPoint])

  useEffect(() => {
    if (currentOp !== 'pathway') {
      setDraftPath(null)
      setDraftPathTargetId(null)
    }
  }, [currentOp])

  useEffect(() => {
    if (currentOp !== 'pathway' || !selectedId?.startsWith('Point')) {
      setDraftPath(null)
      setDraftPathTargetId(null)
      return
    }

    const start = currentPoints().find(point => point.uid === selectedId)
    if (!start) {
      setDraftPath(null)
      setDraftPathTargetId(null)
      return
    }

    setDraftPath((state) => {
      if (state?.startId === selectedId)
        return state

      return {
        startId: selectedId,
        x: start.x,
        y: start.y,
      }
    })
  }, [currentOp, currentPoints, selectedId])

  useEffect(() => {
    if (currentOp !== 'relocalize') {
      relocalizationLaserOffset.current = null
      if (relocalizationPose)
        cancelRelocalization()
      return
    }

    if (!relocalizationLaserOffset.current && robotInfo && laserPose)
      relocalizationLaserOffset.current = getRelativePose(robotInfo.pose, laserPose)
  }, [cancelRelocalization, currentOp, laserPose, relocalizationPose, robotInfo])

  const displayedRobotPose = currentOp === 'relocalize' && relocalizationPose
    ? relocalizationPose
    : robotInfo?.pose
  const displayedLaserPose = currentOp === 'relocalize' && relocalizationPose && relocalizationLaserOffset.current
    ? composePose(relocalizationPose, relocalizationLaserOffset.current)
    : laserPose

  const createPathBetweenPoints = (start: NavPoint, end: NavPoint) => {
    const existingPath = currentPaths().find((path) => {
      const sameDirection = path.start.uid === start.uid && path.end.uid === end.uid
      const reverseDirection = path.start.uid === end.uid && path.end.uid === start.uid
      return sameDirection || reverseDirection
    })

    if (existingPath) {
      selectPoint(existingPath.uid)
      updateOp('select')
      return
    }

    const pid = uid('Path')
    appendCurrentProfilePath({
      uid: pid,
      name: `路径 ${pid.slice(-3)}`,
      start,
      end,
      thickness: 2,
      controls: [
        { x: start.x + (end.x - start.x) / 4, y: start.y + (end.y - start.y) / 4 },
        { x: start.x + (end.x - start.x) / 4 * 3, y: start.y + (end.y - start.y) / 4 * 3 },
      ],
    })
    setDraftPath(null)
    setDraftPathTargetId(null)
    selectPoint(pid)
    updateOp('select')
  }

  const findPathTarget = (x: number, y: number, startId: string) => {
    let nearestTarget: NavPoint | undefined
    let nearestDistance = Number.POSITIVE_INFINITY

    currentPoints().forEach((point) => {
      if (point.uid === startId)
        return

      const distance = Math.hypot(point.x - x, point.y - y)
      if (distance <= pathSnapDistance && distance < nearestDistance) {
        nearestDistance = distance
        nearestTarget = point
      }
    })

    return nearestTarget
  }

  const handleLayerClick = (obj: Konva.KonvaEventObject<MouseEvent>) => {
    const layer = layerRef.current
    if (!layer || !gridInfo)
      return

    if (currentOp === 'select') {
      if (selectedId || selectedPointIds.length > 0)
        selectPoint(null)
    }
    else if (currentOp === 'pathway') {
      if (selectedId)
        selectPoint(null)
      setDraftPath(null)
      setDraftPathTargetId(null)
    }
    else if (currentOp === 'waypoint') {
      if (!currentProfileId)
        return

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
      openPointEditor(id)
      selectPoint(id)
      updateOp('select')
    }
  }

  const handlePointClick = (id: string, event: Konva.KonvaEventObject<MouseEvent>) => {
    if (currentOp === 'pathway') {
      if (!selectedId) {
        selectPoint(id)
      }
      else if (selectedId === id) {
        selectPoint(null)
        setDraftPath(null)
        setDraftPathTargetId(null)
      }
      else if (selectedId && selectedId !== id) {
        const start = currentPoints().find(p => p.uid === selectedId)
        const end = currentPoints().find(p => p.uid === id)
        if (!start || !end)
          return

        createPathBetweenPoints(start, end)
      }
    }
    else if (currentOp === 'select') {
      const hasModifier = event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey
      if (hasModifier) {
        togglePointSelection(id)
        return
      }

      selectPoint(id)
    }
  }

  const handlePathClick = (id: string) => {
    if (currentOp === 'select')
      selectPoint(id)
  }

  const handleLayerDrag = (obj: Konva.KonvaEventObject<DragEvent>) => {
    if (currentOp !== 'move')
      return

    const evt = obj.evt
    setOffset(prevState => ({
      x: prevState.x + evt.movementX,
      y: prevState.y + evt.movementY,
    }))
  }

  const handleLayerMouseMove = () => {
    if (currentOp !== 'pathway' || !draftPath || !layerRef.current)
      return

    const pointer = layerRef.current.getRelativePointerPosition()
    if (!pointer)
      return

    const target = findPathTarget(pointer.x, pointer.y, draftPath.startId)
    setDraftPathTargetId(target?.uid ?? null)
    setDraftPath(state => state
      ? {
          ...state,
          x: pointer.x,
          y: pointer.y,
        }
      : state)
  }

  return (
    <div
      className={`flex-1 ${currentOp === 'move' ? 'cursor-pointer' : currentOp === 'relocalize' ? 'cursor-crosshair' : ''}`}
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
          onMouseMove={handleLayerMouseMove}
          onClick={handleLayerClick}>
          <GridMap />
          {(gridInfo && displayedRobotPose && currentOp !== 'relocalize')
            && <Robot
              pose={displayedRobotPose} />
          }
          {(gridInfo && relocalizationPose && currentOp === 'relocalize')
            && <RelocalizationRobot
              pose={relocalizationPose}
              onPoseChange={updateRelocalizationPose} />
          }
          {(gridInfo && isScanVisible && displayedLaserPose && laserScan)
            && <LaserScan
              pose={displayedLaserPose}
              scan={laserScan}
              pointSize={scanPointSize} />
          }
          {draftPath && (
            <Line
              stroke="#2563EB"
              strokeWidth={pathStrokeWidth}
              hitStrokeWidth={pathStrokeWidth * 2}
              dash={[pathStrokeWidth * 2, pathStrokeWidth]}
              lineCap="round"
              lineJoin="round"
              points={[
                currentPoints().find(point => point.uid === draftPath.startId)?.x ?? draftPath.x,
                currentPoints().find(point => point.uid === draftPath.startId)?.y ?? draftPath.y,
                draftPath.x,
                draftPath.y,
              ]}
            />
          )}
          {currentPaths().map((path, i) => <Pathway
            key={i}
            path={path}
            onSelect={() => handlePathClick(path.uid)}
            isSelected={selectedId === path.uid} />,
          )}
          {currentPoints().map((wp, i) => <Waypoint
            key={i}
            point={wp}
            onSelect={event => handlePointClick(wp.uid, event)}
            isSelected={selectedPointIds.includes(wp.uid)}
            isPrimarySelected={wp.uid === selectedId && selectedPointIds.length === 1}
            isPathTarget={currentOp === 'pathway' && draftPathTargetId === wp.uid}
            isPathSource={currentOp === 'pathway' && wp.uid === selectedId} />)}
          {pathPointInfo.map((p, i) => <PathPoint
            key={i}
            point={p} />)}
        </Layer>
      </Stage>
    </div>
  )
}

export default Monitor
