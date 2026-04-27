import type Konva from 'konva'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Circle, Layer, Line, Stage } from 'react-konva'
import { shallow } from 'zustand/shallow'
import Door from './Door'
import GridMap from './GridMap'
import LaserScan from './LaserScan'
import Lift from './Lift'
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
import type { LineWaypointMode, Point2D } from '@/util/waypoints'
import { createLineWaypointPreview, getEvenlyRedistributedWaypoints } from '@/util/waypoints'

interface ImageState {
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number | null
}

const DEFAULT_LINE_WAYPOINT_COUNT = '5'
const DEFAULT_LINE_WAYPOINT_SPACING = '1.00'

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

function parseDraftNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function formatNumber(value: number) {
  if (!Number.isFinite(value))
    return '0'

  return value.toFixed(2)
}

const Monitor: React.FC = () => {
  const layerRef = useRef<Konva.Layer>(null)
  const lastHandledCenterRequestId = useRef(0)
  const relocalizationLaserOffset = useRef<PoseMessage | null>(null)
  const [layerState, setLayerState] = useState<ImageState>()
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [draftPath, setDraftPath] = useState<{ startId: string; x: number; y: number } | null>(null)
  const [draftPathTargetId, setDraftPathTargetId] = useState<string | null>(null)
  const [lineWaypointDraft, setLineWaypointDraft] = useState<{ start: Point2D; end: Point2D } | null>(null)
  const [lineWaypointPanelOpen, setLineWaypointPanelOpen] = useState(false)
  const [lineWaypointMode, setLineWaypointMode] = useState<LineWaypointMode>('spacing')
  const [lineWaypointCount, setLineWaypointCount] = useState(DEFAULT_LINE_WAYPOINT_COUNT)
  const [lineWaypointSpacing, setLineWaypointSpacing] = useState(DEFAULT_LINE_WAYPOINT_SPACING)
  const [lineWaypointConnect, setLineWaypointConnect] = useState(true)
  const [containerRef, { width, height }] = useElementSize()

  const { currentOp, selectedId, selectedPointIds, selectPoint, selectPoints, togglePointSelection, openPointEditor } = useOperationStore(state => ({
    currentOp: state.current,
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
    currentDoors, appendCurrentProfileDoor, removeCurrentProfileDoor,
    currentLifts, appendCurrentProfileLift, removeCurrentProfileLift,
  } = useProfileStore(state => ({
    currentProfileId: state.currentProfileId,
    currentPoints: state.currentProfilePoints,
    appendCurrentProfilePoint: state.appendCurrentProfilePoint,
    updateCurrentProfilePoints: state.updateCurrentProfilePoints,
    removeCurrentProfilePoint: state.removeCurrentProfilePoint,
    currentPaths: state.currentProfilePaths,
    appendCurrentProfilePath: state.appendCurrentProfilePath,
    removeCurrentProfilePath: state.removeCurrentProfilePath,
    currentDoors: state.currentProfileDoors,
    appendCurrentProfileDoor: state.appendCurrentProfileDoor,
    removeCurrentProfileDoor: state.removeCurrentProfileDoor,
    currentLifts: state.currentProfileLifts,
    appendCurrentProfileLift: state.appendCurrentProfileLift,
    removeCurrentProfileLift: state.removeCurrentProfileLift,
  }), shallow)

  const pathStrokeWidth = useMemo(() => {
    if (!robotParams)
      return 0.1
    if (robotParams.robot_footprint.is_round)
      return Math.max(robotParams.robot_footprint.radius / 10, 0.1)
    return Math.max(robotParams.robot_footprint.robot_width / 10, 0.1)
  }, [robotParams])

  const pathSnapDistance = useMemo(() => Math.max(pathStrokeWidth * 5, 0.35), [pathStrokeWidth])
  const lineWaypointPreview = useMemo(() => {
    if (!lineWaypointDraft)
      return null

    return createLineWaypointPreview(lineWaypointDraft.start, lineWaypointDraft.end, {
      mode: lineWaypointMode,
      count: parseDraftNumber(lineWaypointCount),
      spacing: parseDraftNumber(lineWaypointSpacing),
    })
  }, [lineWaypointCount, lineWaypointDraft, lineWaypointMode, lineWaypointSpacing])

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
      return
    }

    if (selectedId.startsWith('Door')) {
      removeCurrentProfileDoor(selectedId)
      selectPoint(null)
      return
    }

    if (selectedId.startsWith('Lift')) {
      removeCurrentProfileLift(selectedId)
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

    const layout = getEvenlyRedistributedWaypoints(selectedPoints)
    if (!layout)
      return

    event.preventDefault()
    updateCurrentProfilePoints(layout.updates)
    selectPoints(layout.orderedPoints.map(point => point.uid), layout.orderedPoints[layout.orderedPoints.length - 1].uid)
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
    if (currentOp !== 'waypointLine') {
      setLineWaypointDraft(null)
      setLineWaypointPanelOpen(false)
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

  const getPointerMapPoint = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const layer = layerRef.current
    if (!layer || !gridInfo)
      return null

    return {
      x: (event.evt.offsetX - layer.x()) * (gridInfo.resolution / scale),
      y: (event.evt.offsetY - layer.y()) * (gridInfo.resolution / scale),
    }
  }

  const createPathPayload = (start: NavPoint, end: NavPoint) => {
    const pid = uid('Path')
    return {
      uid: pid,
      name: `路径 ${pid.slice(-3)}`,
      start,
      end,
      thickness: 2,
      controls: [
        { x: start.x + (end.x - start.x) / 4, y: start.y + (end.y - start.y) / 4 },
        { x: start.x + (end.x - start.x) / 4 * 3, y: start.y + (end.y - start.y) / 4 * 3 },
      ],
    }
  }

  const createPathBetweenPoints = (start: NavPoint, end: NavPoint) => {
    const existingPath = currentPaths().find((path) => {
      const sameDirection = path.start.uid === start.uid && path.end.uid === end.uid
      const reverseDirection = path.start.uid === end.uid && path.end.uid === start.uid
      return sameDirection || reverseDirection
    })

    if (existingPath) {
      setDraftPath(null)
      setDraftPathTargetId(null)
      selectPoint(end.uid)
      return
    }

    appendCurrentProfilePath(createPathPayload(start, end))
    setDraftPath(null)
    setDraftPathTargetId(null)
    selectPoint(end.uid)
  }

  const cancelLineWaypointDraft = () => {
    setLineWaypointDraft(null)
    setLineWaypointPanelOpen(false)
  }

  const updateLineWaypointAnchor = (point: Point2D) => {
    if (!currentProfileId || lineWaypointPanelOpen)
      return

    if (!lineWaypointDraft) {
      setLineWaypointDraft({ start: point, end: point })
      return
    }

    if (Math.hypot(point.x - lineWaypointDraft.start.x, point.y - lineWaypointDraft.start.y) < 1e-6)
      return

    setLineWaypointDraft({ start: lineWaypointDraft.start, end: point })
    setLineWaypointPanelOpen(true)
  }

  const confirmLineWaypointDraft = () => {
    if (!lineWaypointPreview || lineWaypointPreview.points.length < 2)
      return

    const createdPoints = lineWaypointPreview.points.map((point) => {
      const id = uid('Point')
      return {
        uid: id,
        name: `路径点 ${id.slice(-3)}`,
        x: point.x,
        y: point.y,
        rotation: point.rotation,
        is_charger: false,
        is_parking_spot: false,
      }
    })

    createdPoints.forEach(point => appendCurrentProfilePoint(point))

    if (lineWaypointConnect) {
      createdPoints.slice(0, -1).forEach((point, index) => {
        appendCurrentProfilePath(createPathPayload(point, createdPoints[index + 1]))
      })
    }

    selectPoints(createdPoints.map(point => point.uid), createdPoints[createdPoints.length - 1].uid)
    cancelLineWaypointDraft()
    toast.success(`已创建 ${createdPoints.length} 个等距路径点`)
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
    if (!layerRef.current || !gridInfo)
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

      const point = getPointerMapPoint(obj)
      if (!point)
        return

      const id = uid('Point')
      appendCurrentProfilePoint({
        x: point.x,
        y: point.y,
        name: `路径点 ${id.slice(-3)}`,
        uid: id,
        rotation: 0,
        is_charger: false,
        is_parking_spot: false,
      })
      openPointEditor(id)
      selectPoint(id)
    }
    else if (currentOp === 'waypointLine') {
      const point = getPointerMapPoint(obj)
      if (!point)
        return

      updateLineWaypointAnchor(point)
    }
    else if (currentOp === 'door') {
      if (!currentProfileId)
        return

      const point = getPointerMapPoint(obj)
      if (!point)
        return

      const id = uid('Door')
      appendCurrentProfileDoor({
        uid: id,
        name: `门 ${id.slice(-3)}`,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 1.2,
        door_type: 'sliding',
      })
      selectPoint(id)
    }
    else if (currentOp === 'lift') {
      if (!currentProfileId)
        return

      const point = getPointerMapPoint(obj)
      if (!point)
        return

      const id = uid('Lift')
      appendCurrentProfileLift({
        uid: id,
        name: `电梯 ${id.slice(-3)}`,
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 2.4,
        depth: 2.4,
        level_name: 'L1',
      })
      selectPoint(id)
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
    else if (currentOp === 'waypointLine') {
      const point = currentPoints().find(point => point.uid === id)
      if (!point)
        return

      updateLineWaypointAnchor(point)
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

  const handleDoorClick = (id: string, event: Konva.KonvaEventObject<MouseEvent>) => {
    if (currentOp === 'select' || currentOp === 'door') {
      event.cancelBubble = true
      selectPoint(id)
    }
  }

  const handleLiftClick = (id: string, event: Konva.KonvaEventObject<MouseEvent>) => {
    if (currentOp === 'select' || currentOp === 'lift') {
      event.cancelBubble = true
      selectPoint(id)
    }
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
    if (currentOp === 'waypointLine' && lineWaypointDraft && !lineWaypointPanelOpen && layerRef.current) {
      const pointer = layerRef.current.getRelativePointerPosition()
      if (!pointer)
        return

      setLineWaypointDraft(state => state
        ? {
            ...state,
            end: pointer,
          }
        : state)
      return
    }

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
      className={`relative flex-1 ${currentOp === 'move' ? 'cursor-pointer' : currentOp === 'relocalize' || currentOp === 'waypoint' || currentOp === 'waypointLine' || currentOp === 'door' || currentOp === 'lift' ? 'cursor-crosshair' : ''}`}
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
          {lineWaypointPreview && lineWaypointPreview.points.length > 1 && (
            <>
              <Line
                stroke="#059669"
                strokeWidth={pathStrokeWidth}
                hitStrokeWidth={pathStrokeWidth * 2}
                dash={[pathStrokeWidth * 2, pathStrokeWidth]}
                lineCap="round"
                lineJoin="round"
                points={lineWaypointPreview.points.flatMap(point => [point.x, point.y])}
              />
              {lineWaypointPreview.points.map((point, index) => (
                <Circle
                  key={`${index}-${point.x}-${point.y}`}
                  x={point.x}
                  y={point.y}
                  radius={Math.max(pathStrokeWidth * 0.9, 0.12)}
                  fill="#10B981"
                  stroke="white"
                  strokeWidth={Math.max(pathStrokeWidth * 0.18, 0.03)}
                />
              ))}
            </>
          )}
          {currentPaths().map((path, i) => <Pathway
            key={i}
            path={path}
            onSelect={() => handlePathClick(path.uid)}
            isSelected={selectedId === path.uid} />,
          )}
          {currentDoors().map((door, i) => <Door
            key={i}
            door={door}
            onSelect={event => handleDoorClick(door.uid, event)}
            isSelected={selectedId === door.uid} />,
          )}
          {currentLifts().map((lift, i) => <Lift
            key={i}
            lift={lift}
            onSelect={event => handleLiftClick(lift.uid, event)}
            isSelected={selectedId === lift.uid} />,
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
      {currentOp === 'waypointLine' && lineWaypointDraft && (
        <div
          className="absolute z-30 left-3 bottom-3 w-74 bg-white border-(solid 1px gray-300) shadow-lg rounded p-3 text-gray-800"
          onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-3.5">等距路径点</span>
            <button
              type="button"
              className="border-none bg-transparent text-gray-500 hover:text-gray-800 text-4"
              onClick={cancelLineWaypointDraft}>
              ×
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded p-1 mb-3">
            <button
              type="button"
              className={`border-none rounded py-1 text-sm ${lineWaypointMode === 'spacing' ? 'bg-white shadow text-emerald-700' : 'bg-transparent text-gray-600'}`}
              onClick={() => setLineWaypointMode('spacing')}>
              按间距
            </button>
            <button
              type="button"
              className={`border-none rounded py-1 text-sm ${lineWaypointMode === 'count' ? 'bg-white shadow text-emerald-700' : 'bg-transparent text-gray-600'}`}
              onClick={() => setLineWaypointMode('count')}>
              按数量
            </button>
          </div>
          {lineWaypointMode === 'spacing'
            ? (
                <label className="flex items-center justify-between gap-3 text-sm mb-2">
                  <span className="text-gray-600">间距(m)</span>
                  <input
                    className="w-24 border-(solid 1px gray-300) rounded px-2 py-1 text-right"
                    value={lineWaypointSpacing}
                    inputMode="decimal"
                    onChange={event => setLineWaypointSpacing(event.target.value)} />
                </label>
              )
            : (
                <label className="flex items-center justify-between gap-3 text-sm mb-2">
                  <span className="text-gray-600">数量</span>
                  <input
                    className="w-24 border-(solid 1px gray-300) rounded px-2 py-1 text-right"
                    value={lineWaypointCount}
                    inputMode="numeric"
                    onChange={event => setLineWaypointCount(event.target.value)} />
                </label>
              )}
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={lineWaypointConnect}
              onChange={event => setLineWaypointConnect(event.target.checked)} />
            <span>自动连接路径</span>
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 bg-gray-50 rounded p-2 mb-3">
            <span>长度 {formatNumber(lineWaypointPreview?.length ?? 0)}</span>
            <span>点数 {lineWaypointPreview?.points.length ?? 0}</span>
            <span>间距 {formatNumber(lineWaypointPreview?.spacing ?? 0)}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="border-none rounded bg-gray-200 hover:bg-gray-300 px-3 py-1.5 text-sm"
              onClick={cancelLineWaypointDraft}>
              取消
            </button>
            <button
              type="button"
              className="border-none rounded bg-gray-700 hover:bg-gray-800 px-3 py-1.5 text-sm text-white"
              onClick={() => {
                setLineWaypointDraft(null)
                setLineWaypointPanelOpen(false)
              }}>
              重新选择
            </button>
            <button
              type="button"
              disabled={!lineWaypointPreview || lineWaypointPreview.points.length < 2}
              className={`border-none rounded px-3 py-1.5 text-sm text-white ${lineWaypointPreview && lineWaypointPreview.points.length >= 2 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-400'}`}
              onClick={confirmLineWaypointDraft}>
              创建
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Monitor
