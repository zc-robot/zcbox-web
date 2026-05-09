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

const ShelfStateModal: React.FC<ShelfStateModalProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shelfPresent, setShelfPresent] = useState(false)
  const [stock, setStock] = useState('0')
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

    setSaving(true)
    try {
      const response = await apiServer.updateShelfState({
        shelf_present: shelfPresent,
        stock: parsedStock,
      })

      if (response.code !== 0 || !response.data) {
        toast.error(response.message || '写入货架状态失败')
        return
      }

      setState(response.data)
      setShelfPresent(response.data.shelf_present)
      setStock(`${response.data.stock}`)
      toast.success('货架状态已更新')
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
      <div className="w-24rem rounded-2xl bg-white p-5 shadow-xl border-(solid 1px gray-200)">
        <div className="flex items-center">
          <div className="i-material-symbols-inventory-2-outline-rounded mr-2 text-6 text-emerald-700" />
          <div>
            <div className="text-5 font-bold">货架 Modbus 状态</div>
            <div className="text-xs text-gray-500">Modbus TCP :502</div>
          </div>
          <div
            className="i-material-symbols-close-rounded ml-a text-5 cursor-pointer text-gray-500 hover:text-gray-900"
            onClick={onClose} />
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
          <div>线圈 401: {state ? formatBoolean(state.shelf_present) : loading ? '读取中...' : '未读取'}</div>
          <div className="mt-1">保持寄存器 50: {state ? state.stock : loading ? '读取中...' : '未读取'}</div>
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
