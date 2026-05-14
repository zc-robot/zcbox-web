import type Konva from 'konva'
import { useEffect, useMemo, useRef } from 'react'
import { Circle, Group, Line, Rect, Text, Transformer } from 'react-konva'
import type { LineConstraint, NavPoint } from '@/types'
import { useOperationStore, useParamsStore, useProfileStore } from '@/store'
import type { Point2D } from '@/util/waypoints'
import { getLineAwareWaypointGroup, projectPointToLineConstraint, translateLineConstraint } from '@/util/waypoints'

interface WaypointProp {
  point: NavPoint
  onSelect: (event: Konva.KonvaEventObject<MouseEvent>) => void
  isSelected: boolean
  isPrimarySelected: boolean
  isHovered?: boolean
  isPathTarget?: boolean
  isPathSource?: boolean
  onHoverChange?: (id: string | null) => void
}

interface DragGroupPointSnapshot {
  uid: string
  x: number
  y: number
  line_constraint?: LineConstraint
}

interface DragGroupSnapshot {
  anchor: Point2D
  points: DragGroupPointSnapshot[]
}

function cloneLineConstraint(constraint: LineConstraint): LineConstraint {
  return {
    uid: constraint.uid,
    start: {
      x: constraint.start.x,
      y: constraint.start.y,
    },
    end: {
      x: constraint.end.x,
      y: constraint.end.y,
    },
  }
}

const Waypoint: React.FC<WaypointProp> = ({
  point,
  onSelect,
  isSelected,
  isPrimarySelected,
  isHovered = false,
  isPathTarget = false,
  isPathSource = false,
  onHoverChange,
}) => {
  const groupRef = useRef<Konva.Group>(null)
  const transformRef = useRef<Konva.Transformer>(null)
  const dragGroupRef = useRef<DragGroupSnapshot | null>(null)
  const currentOp = useOperationStore(state => state.current)
  const selectedPointIds = useOperationStore(state => state.selectedPointIds)
  const selectPoints = useOperationStore(state => state.selectPoints)
  const params = useParamsStore(state => state.robotParams)
  const currentProfilePoints = useProfileStore(state => state.currentProfilePoints)
  const updateCurrentProfilePoint = useProfileStore(state => state.updateCurrentProfilePoint)
  const updateCurrentProfilePoints = useProfileStore(state => state.updateCurrentProfilePoints)

  const handleSelect = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true
    onSelect(event)
  }

  const setPointerCursor = (cursor: string) => {
    const container = groupRef.current?.getStage()?.container()
    if (container)
      container.style.cursor = cursor
  }

  const handleMouseEnter = () => {
    if (currentOp !== 'select')
      return

    onHoverChange?.(point.uid)
    setPointerCursor('pointer')
  }

  const handleMouseLeave = () => {
    onHoverChange?.(null)
    setPointerCursor('')
  }

  useEffect(() => {
    if (isPrimarySelected && transformRef.current && groupRef.current) {
      transformRef.current.nodes([groupRef.current])
      transformRef.current.getLayer()?.batchDraw()
      transformRef.current.forceUpdate()
    }
  }, [isPrimarySelected])

  const marker = useMemo(() => {
    if (!params)
      return null

    const footprint = params.robot_footprint
    const robotWidth = footprint.is_round ? footprint.radius * 2 : footprint.robot_width
    const robotLength = footprint.is_round ? footprint.radius * 2 : footprint.robot_length
    const strokeWidth = Math.max(robotWidth / 12, 0.03)

    return {
      width: robotWidth,
      length: robotLength,
      strokeWidth,
      badgeSize: Math.max(robotWidth * 0.42, 0.12),
      robotCenterOffset: -footprint.nav_center2robot_center,
    }
  }, [params])

  const fillColor = useMemo(() => {
    if (isPathTarget)
      return '#3B82F6'
    if (isPathSource)
      return '#2563EB'
    if (isSelected)
      return '#FF5722'
    if (isHovered)
      return '#06B6D4'
    return '#F59E0B'
  }, [isHovered, isPathSource, isPathTarget, isSelected])

  const getConstrainedPosition = (x: number, y: number) => projectPointToLineConstraint({ x, y }, point.line_constraint)

  const getGroupDragSnapshot = (): DragGroupSnapshot | null => {
    if (selectedPointIds.length < 2)
      return null

    const groupPoints = getLineAwareWaypointGroup(currentProfilePoints(), selectedPointIds)
    if (groupPoints.length < 2)
      return null

    return {
      anchor: {
        x: point.x,
        y: point.y,
      },
      points: groupPoints.map(groupPoint => ({
        uid: groupPoint.uid,
        x: groupPoint.x,
        y: groupPoint.y,
        line_constraint: groupPoint.line_constraint
          ? cloneLineConstraint(groupPoint.line_constraint)
          : undefined,
      })),
    }
  }

  const getGroupDragUpdates = (snapshot: DragGroupSnapshot, delta: Point2D) => {
    const translatedConstraints = new Map<string, LineConstraint>()

    return snapshot.points.map((snapshotPoint) => {
      const pointUpdate: Partial<NavPoint> = {
        x: snapshotPoint.x + delta.x,
        y: snapshotPoint.y + delta.y,
      }

      if (snapshotPoint.line_constraint) {
        let translatedConstraint = translatedConstraints.get(snapshotPoint.line_constraint.uid)
        if (!translatedConstraint) {
          translatedConstraint = translateLineConstraint(snapshotPoint.line_constraint, delta)
          translatedConstraints.set(snapshotPoint.line_constraint.uid, translatedConstraint)
        }
        pointUpdate.line_constraint = translatedConstraint
      }

      return {
        uid: snapshotPoint.uid,
        point: pointUpdate,
      }
    })
  }

  const updateGroupDrag = (event: Konva.KonvaEventObject<DragEvent>) => {
    const snapshot = dragGroupRef.current
    if (!snapshot)
      return false

    const delta = {
      x: event.currentTarget.x() - snapshot.anchor.x,
      y: event.currentTarget.y() - snapshot.anchor.y,
    }

    updateCurrentProfilePoints(getGroupDragUpdates(snapshot, delta))
    return true
  }

  const onDragStart = () => {
    const snapshot = getGroupDragSnapshot()
    dragGroupRef.current = snapshot

    if (snapshot && snapshot.points.length !== selectedPointIds.length)
      selectPoints(snapshot.points.map(snapshotPoint => snapshotPoint.uid), point.uid)
  }

  const onDragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    if (updateGroupDrag(event))
      return

    const position = getConstrainedPosition(event.currentTarget.x(), event.currentTarget.y())
    event.currentTarget.position(position)
  }

  const onDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    if (updateGroupDrag(event)) {
      dragGroupRef.current = null
      return
    }

    const position = getConstrainedPosition(event.currentTarget.x(), event.currentTarget.y())
    updateCurrentProfilePoint(point.uid, {
      x: position.x,
      y: position.y,
    })
  }

  const onTransformEnd = () => {
    const node = groupRef.current
    if (!node)
      return

    const position = getConstrainedPosition(node.x(), node.y())
    updateCurrentProfilePoint(point.uid, {
      x: position.x,
      y: position.y,
      rotation: node.rotation(),
    })
  }

  return (
    <>
      {marker && (
        <Group
          ref={groupRef}
          x={point.x}
          y={point.y}
          rotation={point.rotation}
          draggable={isPrimarySelected && currentOp === 'select'}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onTransformEnd={onTransformEnd}
          onClick={handleSelect}
          onTap={handleSelect}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}>
          {isHovered && currentOp === 'select' && (
            <Rect
              x={0}
              y={0}
              offsetX={marker.width / 2}
              offsetY={marker.length / 2 + marker.robotCenterOffset}
              width={marker.width}
              height={marker.length}
              rotation={90}
              stroke="#06B6D4"
              strokeWidth={marker.strokeWidth * 1.35}
              opacity={0.9}
              dash={[marker.strokeWidth * 3.5, marker.strokeWidth * 2.4]}
              listening={false}
            />
          )}
          <Rect
            x={0}
            y={0}
            offsetX={marker.width / 2}
            offsetY={marker.length / 2 + marker.robotCenterOffset}
            width={marker.width}
            height={marker.length}
            rotation={90}
            fill={`${fillColor}33`}
            stroke={fillColor}
            strokeWidth={marker.strokeWidth}
          />
          <Circle
            radius={marker.strokeWidth * 1.25}
            fill={fillColor}
          />
          <Line
            points={[0, 0, marker.length / 2, 0]}
            stroke={fillColor}
            strokeWidth={marker.strokeWidth}
            lineCap="round"
          />
          <Line
            points={[
              marker.length / 2, 0,
              marker.length / 2 - marker.strokeWidth * 2.2, -marker.strokeWidth * 1.35,
              marker.length / 2 - marker.strokeWidth * 2.2, marker.strokeWidth * 1.35,
            ]}
            fill={fillColor}
            closed
          />
          {(isPathSource || isPathTarget) && (
            <Rect
              x={0}
              y={0}
              offsetX={marker.width / 2}
              offsetY={marker.length / 2 + marker.robotCenterOffset}
              width={marker.width}
              height={marker.length}
              rotation={90}
              stroke={fillColor}
              strokeWidth={marker.strokeWidth * 1.2}
              dash={[marker.strokeWidth * 3.5, marker.strokeWidth * 2.5]}
              listening={false}
            />
          )}
          {point.is_charger && (
            <Group
              x={marker.width * 0.7}
              y={-(marker.length / 2 + marker.badgeSize * 0.8)}
              rotation={-point.rotation}>
              <Rect
                x={-marker.badgeSize * 0.5}
                y={-marker.badgeSize * 0.34}
                width={marker.badgeSize}
                height={marker.badgeSize * 0.68}
                cornerRadius={marker.badgeSize * 0.1}
                fill="#16A34A"
                stroke="white"
                strokeWidth={marker.badgeSize * 0.08}
              />
              <Rect
                x={marker.badgeSize * 0.5}
                y={-marker.badgeSize * 0.14}
                width={marker.badgeSize * 0.16}
                height={marker.badgeSize * 0.28}
                cornerRadius={marker.badgeSize * 0.04}
                fill="#16A34A"
                stroke="white"
                strokeWidth={marker.badgeSize * 0.04}
              />
              <Line
                points={[
                  -marker.badgeSize * 0.18, -marker.badgeSize * 0.14,
                  0, -marker.badgeSize * 0.14,
                  -marker.badgeSize * 0.08, marker.badgeSize * 0.16,
                  marker.badgeSize * 0.16, marker.badgeSize * 0.16,
                ]}
                stroke="white"
                strokeWidth={marker.badgeSize * 0.08}
                lineCap="round"
                lineJoin="round"
              />
            </Group>
          )}
          {point.is_parking_spot && (
            <Group
              x={point.is_charger ? marker.width * 1.22 : marker.width * 0.7}
              y={-(marker.length / 2 + marker.badgeSize * 0.8)}
              rotation={-point.rotation}>
              <Circle
                radius={marker.badgeSize * 0.5}
                fill="#2563EB"
                stroke="white"
                strokeWidth={marker.badgeSize * 0.08}
              />
              <Text
                x={-marker.badgeSize * 0.22}
                y={-marker.badgeSize * 0.31}
                width={marker.badgeSize * 0.44}
                align="center"
                fontSize={marker.badgeSize * 0.62}
                fontStyle="bold"
                fill="white"
                text="P"
              />
            </Group>
          )}
        </Group>
      )}
      {isPrimarySelected && selectedPointIds.length === 1 && currentOp === 'select' && (
        <Transformer
          ref={transformRef}
          rotateEnabled={true}
          resizeEnabled={false}
          borderEnabled={false}
          flipEnabled={false}
        />
      )}
    </>
  )
}

export default Waypoint
