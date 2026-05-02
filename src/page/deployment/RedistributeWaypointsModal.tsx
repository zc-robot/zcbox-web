import { useMemo, useState } from 'react'
import type { NavPoint } from '@/types'
import { MIN_LINE_WAYPOINT_SPACING, getEvenlyRedistributedWaypoints } from '@/util/waypoints'

interface RedistributeWaypointsModalProps {
  points: NavPoint[]
  defaultSpacing: number | null
  onClose: () => void
  onConfirm: (spacing: number) => void
}

function parseSpacing(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

const RedistributeWaypointsModal: React.FC<RedistributeWaypointsModalProps> = ({
  points,
  defaultSpacing,
  onClose,
  onConfirm,
}) => {
  const [spacing, setSpacing] = useState(defaultSpacing ? defaultSpacing.toFixed(2) : '1.00')
  const parsedSpacing = parseSpacing(spacing)
  const isSpacingValid = Number.isFinite(parsedSpacing) && parsedSpacing >= MIN_LINE_WAYPOINT_SPACING
  const preview = useMemo(() => {
    if (!isSpacingValid)
      return null

    return getEvenlyRedistributedWaypoints(points, parsedSpacing)
  }, [isSpacingValid, parsedSpacing, points])

  const handleConfirm = () => {
    if (!preview || !isSpacingValid)
      return

    onConfirm(parsedSpacing)
  }

  return (
    <div
      className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-justify-center flex-items-center bg-gray-900/30"
      onClick={onClose}>
      <div
        className="flex flex-col border-solid border-1px border-gray-300 shadow-md w-32rem max-w-90vw max-h-85vh p-4 bg-white rounded-2xl"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-center text-3">
          <span className="text-5 font-bold mr-3">等距重排路径点</span>
          <span className="text-gray-500">{points.length} 个路径点</span>
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5 cursor-pointer"
            onClick={onClose} />
        </div>

        <label className="mt-4 flex items-center justify-between gap-4 text-sm">
          <span className="font-bold text-gray-700">相邻间距(m)</span>
          <input
            className="w-32 border-(solid 1px gray-300) rounded px-2 py-1.5 text-right"
            inputMode="decimal"
            value={spacing}
            onChange={event => setSpacing(event.target.value)} />
        </label>
        <div className="mt-2 text-xs text-gray-500">
          当前自动间距：{defaultSpacing ? formatNumber(defaultSpacing) : '无法计算'}m，最小间距：{MIN_LINE_WAYPOINT_SPACING.toFixed(2)}m
        </div>
        {!isSpacingValid && (
          <div className="mt-2 text-xs text-red-600">
            请输入不小于 {MIN_LINE_WAYPOINT_SPACING.toFixed(2)}m 的有效数字
          </div>
        )}

        <div className="mt-4 rounded-lg border-(solid 1px gray-200) overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">
            <span>路径点</span>
            <span className="text-right">新 X</span>
            <span className="text-right">新 Y</span>
          </div>
          <div className="max-h-64 overflow-auto">
            {preview?.orderedPoints.map((point) => {
              const update = preview.updates.find(item => item.uid === point.uid)?.point
              return (
                <div
                  key={point.uid}
                  className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-3 border-t-(solid 1px gray-100) px-3 py-2 text-sm">
                  <span className="truncate text-gray-700">{point.name}</span>
                  <span className="text-right font-mono text-gray-500">{formatNumber(update?.x ?? point.x)}</span>
                  <span className="text-right font-mono text-gray-500">{formatNumber(update?.y ?? point.y)}</span>
                </div>
              )
            }) ?? (
              <div className="px-3 py-4 text-sm text-gray-500">
                路径点距离过近，无法重排
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
            disabled={!preview || !isSpacingValid}
            className={`border-none px-4 py-2 rounded-lg text-sm text-white ${preview && isSpacingValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}
            onClick={handleConfirm}>
            重排
          </button>
        </div>
      </div>
    </div>
  )
}

export default RedistributeWaypointsModal
