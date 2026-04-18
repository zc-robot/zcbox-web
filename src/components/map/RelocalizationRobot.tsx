import type Konva from 'konva'
import { useEffect, useMemo, useRef } from 'react'
import { Circle, Group, Line, Rect, Transformer } from 'react-konva'
import { useParamsStore } from '@/store'
import type { FootprintParams, PoseMessage } from '@/types'
import { canvasAngleToQuaternion, canvasAngleToYaw, quaternionToCanvasAngle } from '@/util/transform'

interface RelocalizationRobotProps {
  pose: PoseMessage
  onPoseChange: (pose: PoseMessage) => void
}

const strokeColor = '#2563EB'
const centerColor = '#DC2626'
const headingColor = '#2563EB'

function renderFootprint(footprint: FootprintParams) {
  const robotCenterOffset = -footprint.nav_center2robot_center

  if (footprint.is_round) {
    return (
      <>
        <Circle
          radius={footprint.radius}
          offsetX={-robotCenterOffset}
          stroke={strokeColor}
          strokeWidth={footprint.robot_width / 10}
          fill="rgba(37, 99, 235, 0.08)"
        />
        <Circle
          name="robotCenter"
          radius={footprint.radius / 10}
          fill={centerColor}
        />
        <Line
          points={[0, 0, footprint.radius, 0]}
          stroke={headingColor}
          strokeWidth={footprint.robot_width / 10}
        />
      </>
    )
  }

  return (
    <>
      <Rect
        offsetX={footprint.robot_width / 2}
        offsetY={footprint.robot_length / 2 + robotCenterOffset}
        width={footprint.robot_width}
        height={footprint.robot_length}
        stroke={strokeColor}
        strokeWidth={footprint.robot_width / 10}
        fill="rgba(37, 99, 235, 0.08)"
        rotation={90}
      />
      <Circle
        name="robotCenter"
        radius={footprint.robot_width / 10}
        fill={centerColor}
      />
      <Line
        points={[0, 0, footprint.robot_length / 2, 0]}
        stroke={headingColor}
        strokeWidth={footprint.robot_width / 10}
      />
    </>
  )
}

const RelocalizationRobot: React.FC<RelocalizationRobotProps> = ({ pose, onPoseChange }) => {
  const params = useParamsStore(state => state.robotParams)
  const groupRef = useRef<Konva.Group>(null)
  const transformRef = useRef<Konva.Transformer>(null)

  const dragBoundsRadius = useMemo(() => {
    if (!params)
      return 0

    const footprint = params.robot_footprint
    return footprint.is_round
      ? footprint.radius * 1.6
      : Math.max(footprint.robot_width, footprint.robot_length) * 0.9
  }, [params])

  const syncPoseFromNode = () => {
    const node = groupRef.current
    if (!node)
      return

    const rotation = node.rotation()
    onPoseChange({
      position: {
        ...pose.position,
        x: node.x(),
        y: -node.y(),
      },
      orientation: canvasAngleToQuaternion(rotation),
      pyr: {
        ...pose.pyr,
        yaw: canvasAngleToYaw(rotation),
      },
    })
  }

  useEffect(() => {
    if (!groupRef.current || !transformRef.current)
      return

    transformRef.current.nodes([groupRef.current])
    transformRef.current.getLayer()?.batchDraw()
    transformRef.current.forceUpdate()
  }, [params, pose])

  if (!params)
    return null

  const handlePointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={pose.position.x}
        y={-pose.position.y}
        rotation={quaternionToCanvasAngle(pose.orientation)}
        draggable
        onClick={handlePointerDown}
        onTap={handlePointerDown}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onDragMove={syncPoseFromNode}
        onDragEnd={syncPoseFromNode}
        onTransform={syncPoseFromNode}
        onTransformEnd={() => {
          const node = groupRef.current
          if (!node)
            return
          node.scaleX(1)
          node.scaleY(1)
          syncPoseFromNode()
        }}>
        <Circle
          radius={dragBoundsRadius}
          stroke="rgba(37, 99, 235, 0.35)"
          dash={[0.12, 0.12]}
          strokeWidth={0.03}
        />
        {renderFootprint(params.robot_footprint)}
      </Group>
      <Transformer
        ref={transformRef}
        rotateEnabled={true}
        resizeEnabled={false}
        borderEnabled={false}
        flipEnabled={false}
        rotateAnchorOffset={28}
        anchorFill={strokeColor}
        anchorStroke="white"
      />
    </>
  )
}

export default RelocalizationRobot
