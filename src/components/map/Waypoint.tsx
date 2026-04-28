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
  isPathTarget?: boolean
  isPathSource?: boolean
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
  isPathTarget = false,
  isPathSource = false,
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

  useEffect(() => {
    if (isPrimarySelected && transformRef.current && groupRef.current) {
      transformRef.current.nodes([groupRef.current])
      transformRef.current.getLayer()?.batchDraw()
      transformRef.current.forceUpdate()
    }
  }, [isPrimarySelected])

  const width = useMemo(() => {
    if (!params)
      return 0
    if (params.robot_footprint.is_round)
      return params.robot_footprint.radius / 5
    return params.robot_footprint.robot_width / 5
  }, [params])

  const fillColor = useMemo(() => {
    if (isPathTarget)
      return '#3B82F6'
    if (isPathSource)
      return '#2563EB'
    if (isSelected)
      return '#FF5722'
    return '#F59E0B'
  }, [isPathSource, isPathTarget, isSelected])

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
      {params && (
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
          onTap={handleSelect}>
          <Circle
            radius={width * 0.95}
            fill="white"
            stroke={fillColor}
            strokeWidth={width * 0.25}
          />
          <Circle
            radius={width * 0.28}
            fill={fillColor}
          />
          <Line
            points={[width * 0.18, 0, width * 0.72, 0]}
            stroke={fillColor}
            strokeWidth={width * 0.28}
            lineCap="round"
          />
          <Line
            points={[
              width * 0.62, -width * 0.24,
              width * 1.08, 0,
              width * 0.62, width * 0.24,
            ]}
            fill={fillColor}
            closed
          />
          {(isPathSource || isPathTarget) && (
            <Circle
              radius={width * 1.35}
              stroke={fillColor}
              strokeWidth={width * 0.12}
              dash={[width * 0.4, width * 0.25]}
            />
          )}
          {point.is_charger && (
            <Group
              x={width * 1.45}
              y={-width * 1.1}
              rotation={-point.rotation}>
              <Rect
                x={-width * 0.42}
                y={-width * 0.28}
                width={width * 0.84}
                height={width * 0.56}
                cornerRadius={width * 0.08}
                fill="#16A34A"
                stroke="white"
                strokeWidth={width * 0.08}
              />
              <Rect
                x={width * 0.42}
                y={-width * 0.12}
                width={width * 0.14}
                height={width * 0.24}
                cornerRadius={width * 0.04}
                fill="#16A34A"
                stroke="white"
                strokeWidth={width * 0.04}
              />
              <Line
                points={[
                  -width * 0.15, -width * 0.12,
                  0, -width * 0.12,
                  -width * 0.06, width * 0.14,
                  width * 0.14, width * 0.14,
                ]}
                stroke="white"
                strokeWidth={width * 0.08}
                lineCap="round"
                lineJoin="round"
              />
            </Group>
          )}
          {point.is_parking_spot && (
            <Group
              x={point.is_charger ? width * 2.35 : width * 1.45}
              y={-width * 1.1}
              rotation={-point.rotation}>
              <Circle
                radius={width * 0.42}
                fill="#2563EB"
                stroke="white"
                strokeWidth={width * 0.08}
              />
              <Text
                x={-width * 0.18}
                y={-width * 0.26}
                width={width * 0.36}
                align="center"
                fontSize={width * 0.52}
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
