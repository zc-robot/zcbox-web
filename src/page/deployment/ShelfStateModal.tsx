import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import apiServer from '@/service/apiServer'
import type { ShelfState } from '@/service/apiServer'

interface ShelfStateModalProps {
  onClose: () => void
}

function formatBoolean(value: boolean) {
  return value ? '有货架' : '无货架'
}

function formatLiftEnabled(value: boolean) {
  return value ? '启动' : '关闭'
}

const ShelfStateModal: React.FC<ShelfStateModalProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shelfPresent, setShelfPresent] = useState(false)
  const [stock, setStock] = useState('0')
  const [liftEnabled, setLiftEnabled] = useState(false)
  const [liftTargetHeight, setLiftTargetHeight] = useState('0')
  const [state, setState] = useState<ShelfState | null>(null)

  const loadShelfState = async () => {
    setLoading(true)
    try {
      const response = await apiServer.fetchShelfState()
      if (response.code !== 0 || !response.data) {
        toast.error(response.message || '读取货架状态失败')
        return
      }

      setState(response.data)
      setShelfPresent(response.data.shelf_present)
      setStock(`${response.data.stock}`)
      setLiftEnabled(response.data.lift_enabled)
      setLiftTargetHeight(`${response.data.lift_target_height}`)
    }
    catch (error) {
      toast.error(`读取货架状态失败 ${error}`)
    }
    finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadShelfState()
  }, [])

  const handleSave = async () => {
    const parsedStock = Number(stock)
    if (!Number.isInteger(parsedStock) || parsedStock < 0 || parsedStock > 65535) {
      toast.error('库存必须是 0-65535 的整数')
      return
    }
    const parsedLiftTargetHeight = Number(liftTargetHeight)
    if (!Number.isInteger(parsedLiftTargetHeight) || parsedLiftTargetHeight < 0 || parsedLiftTargetHeight > 65535) {
      toast.error('目标高度必须是 0-65535 的整数')
      return
    }

    setSaving(true)
    try {
      const response = await apiServer.updateShelfState({
        shelf_present: shelfPresent,
        stock: parsedStock,
        lift_enabled: liftEnabled,
        lift_target_height: parsedLiftTargetHeight,
      })

      if (response.code !== 0 || !response.data) {
        toast.error(response.message || '写入货架状态失败')
        return
      }

      setState(response.data)
      setShelfPresent(response.data.shelf_present)
      setStock(`${response.data.stock}`)
      setLiftEnabled(response.data.lift_enabled)
      setLiftTargetHeight(`${response.data.lift_target_height}`)
      toast.success('Modbus 状态已更新')
    }
    catch (error) {
      toast.error(`写入货架状态失败 ${error}`)
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-(justify-center items-center) bg-gray-900/30">
      <div className="max-h-[90vh] w-24rem overflow-auto rounded-2xl bg-white p-5 shadow-xl border-(solid 1px gray-200)">
        <div className="flex items-center">
          <div className="i-material-symbols-inventory-2-outline-rounded mr-2 text-6 text-emerald-700" />
          <div>
            <div className="text-5 font-bold">机器人 Modbus 状态</div>
            <div className="text-xs text-gray-500">Modbus TCP :502</div>
          </div>
          <div
            className="i-material-symbols-close-rounded ml-a text-5 cursor-pointer text-gray-500 hover:text-gray-900"
            onClick={onClose} />
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
          <div className="font-bold text-gray-700">货架</div>
          <div className="mt-1">线圈 401: {state ? formatBoolean(state.shelf_present) : loading ? '读取中...' : '未读取'}</div>
          <div className="mt-1">保持寄存器 50: {state ? state.stock : loading ? '读取中...' : '未读取'}</div>
          <div className="mt-3 font-bold text-gray-700">升降机构</div>
          <div className="mt-1">线圈 7: {state ? formatLiftEnabled(state.lift_enabled) : loading ? '读取中...' : '未读取'}</div>
          <div className="mt-1">实际高度 HR 51: {state ? state.lift_real_height : loading ? '读取中...' : '未读取'}</div>
          <div className="mt-1">目标高度 HR 52: {state ? state.lift_target_height : loading ? '读取中...' : '未读取'}</div>
        </div>

        <label className="mt-4 flex items-center justify-between gap-4 text-sm">
          <span className="font-bold text-gray-700">货架存在</span>
          <select
            className="w-32 rounded-md border-(solid 1px gray-300) bg-gray-50 px-2 py-1"
            value={shelfPresent ? 'true' : 'false'}
            disabled={loading || saving}
            onChange={event => setShelfPresent(event.target.value === 'true')}>
            <option value="true">有货架</option>
            <option value="false">无货架</option>
          </select>
        </label>

        <label className="mt-3 flex items-center justify-between gap-4 text-sm">
          <span className="font-bold text-gray-700">库存</span>
          <input
            className="w-32 rounded-md border-(solid 1px gray-300) bg-gray-50 px-2 py-1 text-right"
            type="number"
            min="0"
            max="65535"
            step="1"
            value={stock}
            disabled={loading || saving}
            onChange={event => setStock(event.target.value)} />
        </label>

        <div className="mt-5 border-t-(solid 1px gray-200) pt-4">
          <div className="mb-3 text-sm font-bold text-gray-700">升降机构</div>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="font-bold text-gray-700">启动目标高度</span>
            <select
              className="w-32 rounded-md border-(solid 1px gray-300) bg-gray-50 px-2 py-1"
              value={liftEnabled ? 'true' : 'false'}
              disabled={loading || saving}
              onChange={event => setLiftEnabled(event.target.value === 'true')}>
              <option value="true">启动</option>
              <option value="false">关闭</option>
            </select>
          </label>

          <label className="mt-3 flex items-center justify-between gap-4 text-sm">
            <span className="font-bold text-gray-700">目标高度</span>
            <input
              className="w-32 rounded-md border-(solid 1px gray-300) bg-gray-50 px-2 py-1 text-right"
              type="number"
              min="0"
              max="65535"
              step="1"
              value={liftTargetHeight}
              disabled={loading || saving}
              onChange={event => setLiftTargetHeight(event.target.value)} />
          </label>
        </div>

        <div className="mt-5 flex justify-between">
          <button
            type="button"
            className="rounded-md border-(solid 1px gray-300) px-3 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={loading || saving}
            onClick={loadShelfState}>
            刷新
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border-(solid 1px gray-300) px-3 py-1.5 text-gray-600 hover:bg-gray-100"
              onClick={onClose}>
              关闭
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-800 disabled:opacity-50"
              disabled={loading || saving}
              onClick={handleSave}>
              {saving ? '写入中...' : '写入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShelfStateModal
