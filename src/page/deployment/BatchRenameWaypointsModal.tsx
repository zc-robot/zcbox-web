import { useMemo, useState } from 'react'
import type { NavPoint } from '@/types'
import type { WaypointRenameOrder } from '@/util/waypoints'
import { buildWaypointRenamePreview } from '@/util/waypoints'

interface BatchRenameWaypointsModalProps {
  points: NavPoint[]
  onClose: () => void
  onConfirm: (updates: { uid: string; name: string }[]) => void
}

const orderOptions: { value: WaypointRenameOrder; label: string }[] = [
  { value: 'line', label: '沿线顺序' },
  { value: 'reverseLine', label: '沿线反向' },
  { value: 'selection', label: '选择顺序' },
  { value: 'leftToRight', label: '从左到右' },
  { value: 'rightToLeft', label: '从右到左' },
  { value: 'topToBottom', label: '从上到下' },
  { value: 'bottomToTop', label: '从下到上' },
]

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const BatchRenameWaypointsModal: React.FC<BatchRenameWaypointsModalProps> = ({ points, onClose, onConfirm }) => {
  const [pattern, setPattern] = useState('area_1_shelf_1_column_{n}')
  const [start, setStart] = useState('1')
  const [step, setStep] = useState('1')
  const [order, setOrder] = useState<WaypointRenameOrder>('line')

  const preview = useMemo(() => buildWaypointRenamePreview(points, {
    pattern,
    start: parseNumber(start, 1),
    step: parseNumber(step, 1),
    order,
  }), [order, pattern, points, start, step])

  const handleConfirm = () => {
    if (preview.length === 0)
      return

    onConfirm(preview.map(item => ({
      uid: item.point.uid,
      name: item.name,
    })))
  }

  return (
    <div
      className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-justify-center flex-items-center bg-gray-900/30"
      onClick={onClose}>
      <div
        className="flex flex-col border-solid border-1px border-gray-300 shadow-md w-35rem max-w-90vw max-h-85vh p-4 bg-white rounded-2xl"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-center text-3">
          <span className="text-5 font-bold mr-3">批量重命名路径点</span>
          <span className="text-gray-500">{points.length} 个路径点</span>
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5 cursor-pointer"
            onClick={onClose} />
        </div>

        <div className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
          <label className="self-center font-bold text-gray-700">Pattern</label>
          <input
            className="min-w-0 border-(solid 1px gray-300) rounded px-2 py-1.5"
            value={pattern}
            onChange={event => setPattern(event.target.value)} />

          <label className="self-center font-bold text-gray-700">Start</label>
          <input
            className="min-w-0 border-(solid 1px gray-300) rounded px-2 py-1.5"
            inputMode="numeric"
            value={start}
            onChange={event => setStart(event.target.value)} />

          <label className="self-center font-bold text-gray-700">Step</label>
          <input
            className="min-w-0 border-(solid 1px gray-300) rounded px-2 py-1.5"
            inputMode="numeric"
            value={step}
            onChange={event => setStep(event.target.value)} />

          <label className="self-center font-bold text-gray-700">Order</label>
          <select
            className="min-w-0 border-(solid 1px gray-300) rounded px-2 py-1.5 bg-white"
            value={order}
            onChange={event => setOrder(event.target.value as WaypointRenameOrder)}>
            {orderOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 rounded-lg border-(solid 1px gray-200) overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">
            <span>当前名称</span>
            <span>新名称</span>
          </div>
          <div className="max-h-64 overflow-auto">
            {preview.map(item => (
              <div
                key={item.point.uid}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t-(solid 1px gray-100) px-3 py-2 text-sm">
                <span className="truncate text-gray-500">{item.point.name}</span>
                <span className="truncate font-medium text-gray-900">{item.name}</span>
              </div>
            ))}
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
            className="border-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
            onClick={handleConfirm}>
            重命名
          </button>
        </div>
      </div>
    </div>
  )
}

export default BatchRenameWaypointsModal
