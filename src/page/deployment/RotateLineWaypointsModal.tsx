import { useMemo, useState } from 'react'
import type { NavPoint } from '@/types'
import { normalizeRotationDegrees, orderWaypointsByLineProjection, rotatePointAround } from '@/util/waypoints'

interface RotateLineWaypointsModalProps {
  points: NavPoint[]
  onClose: () => void
  onConfirm: (angleDegrees: number) => void
}

function parseAngle(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

const RotateLineWaypointsModal: React.FC<RotateLineWaypointsModalProps> = ({
  points,
  onClose,
  onConfirm,
}) => {
  const [angle, setAngle] = useState('15')
  const parsedAngle = parseAngle(angle)
  const isAngleValid = Number.isFinite(parsedAngle) && Math.abs(parsedAngle) > 0.001
  const orderedPoints = useMemo(() => orderWaypointsByLineProjection(points), [points])
  const lineInfo = useMemo(() => {
    if (!orderedPoints)
      return null

    const start = orderedPoints[0]
    const end = orderedPoints[orderedPoints.length - 1]
    return {
      center: {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      },
      angle: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
    }
  }, [orderedPoints])
  const preview = useMemo(() => {
    if (!orderedPoints || !lineInfo || !isAngleValid)
      return null

    return orderedPoints.map((point) => {
      const position = rotatePointAround(point, lineInfo.center, parsedAngle)
      return {
        point,
        x: position.x,
        y: position.y,
        yaw: normalizeRotationDegrees(point.rotation + parsedAngle),
      }
    })
  }, [isAngleValid, lineInfo, orderedPoints, parsedAngle])

  const adjustAngle = (delta: number) => {
    const base = Number.isFinite(parsedAngle) ? parsedAngle : 0
    setAngle(String(Number((base + delta).toFixed(2))))
  }

  const handleConfirm = () => {
    if (!isAngleValid)
      return

    onConfirm(parsedAngle)
  }

  return (
    <div
      className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-justify-center flex-items-center bg-gray-900/30"
      onClick={onClose}>
      <div
        className="flex flex-col border-solid border-1px border-gray-300 shadow-md w-34rem max-w-90vw max-h-85vh p-4 bg-white rounded-2xl"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-center text-3">
          <span className="text-5 font-bold mr-3">旋转整线路径点</span>
          <span className="text-gray-500">{points.length} 个路径点</span>
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5 cursor-pointer"
            onClick={onClose} />
        </div>

        <label className="mt-4 flex items-center justify-between gap-4 text-sm">
          <span className="font-bold text-gray-700">旋转角度</span>
          <div className="flex items-center gap-2">
            <input
              className="w-28 border-(solid 1px gray-300) rounded px-2 py-1.5 text-right"
              inputMode="decimal"
              value={angle}
              onChange={event => setAngle(event.target.value)} />
            <span className="text-gray-500">度</span>
          </div>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {[-15, -5, 5, 15, 90].map(delta => (
            <button
              key={delta}
              type="button"
              className="border-none rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300"
              onClick={() => adjustAngle(delta)}>
              {delta > 0 ? `+${delta}` : delta}度
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-gray-500">
          正数按画布顺时针旋转，当前线角度：{lineInfo ? `${formatNumber(lineInfo.angle)}度` : '无法计算'}
        </div>
        {!isAngleValid && (
          <div className="mt-2 text-xs text-red-600">
            请输入非 0 的有效旋转角度
          </div>
        )}

        <div className="mt-4 rounded-lg border-(solid 1px gray-200) overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">
            <span>路径点</span>
            <span className="text-right">新 X</span>
            <span className="text-right">新 Y</span>
            <span className="text-right">新 Yaw</span>
          </div>
          <div className="max-h-64 overflow-auto">
            {preview?.map(({ point, x, y, yaw }) => (
              <div
                key={point.uid}
                className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] gap-3 border-t-(solid 1px gray-100) px-3 py-2 text-sm">
                <span className="truncate text-gray-700">{point.name}</span>
                <span className="text-right font-mono text-gray-500">{formatNumber(x)}</span>
                <span className="text-right font-mono text-gray-500">{formatNumber(y)}</span>
                <span className="text-right font-mono text-gray-500">{formatNumber(yaw)}</span>
              </div>
            )) ?? (
              <div className="px-3 py-4 text-sm text-gray-500">
                无法计算旋转预览
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            className="border-none bg-gray-200 px-4 py-2 rounded-lg text-sm"
            onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={!preview || !isAngleValid}
            className={`border-none px-4 py-2 rounded-lg text-sm text-white ${preview && isAngleValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}
            onClick={handleConfirm}>
            旋转
          </button>
        </div>
      </div>
    </div>
  )
}

export default RotateLineWaypointsModal
