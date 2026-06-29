import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useLiftingMotorStatesZenoh } from '@/hooks'
import apiServer from '@/service/apiServer'
import type { MotorStateMessage } from '@/types'
import type { ShelfState } from '@/service/apiServer'

interface ShelfStateModalProps {
  onClose: () => void
}

type ControlCoilAddress = 804 | 805 | 806 | 807

interface ControlCoilAction {
  id: string
  label: string
  steps: Array<{ address: ControlCoilAddress; value: boolean }>
}

const controlCoilActions: ControlCoilAction[] = [
  {
    id: 'fork-extend',
    label: '叉臂伸出',
    steps: [
      { address: 806, value: false },
      { address: 805, value: true },
      { address: 807, value: true },
    ],
  },
  {
    id: 'fork-retract',
    label: '触臂缩回',
    steps: [
      { address: 805, value: false },
      { address: 806, value: true },
      { address: 807, value: true },
    ],
  },
  {
    id: 'power-off',
    label: '断电',
    steps: [
      { address: 805, value: false },
      { address: 806, value: false },
      { address: 807, value: false },
    ],
  },
]

function formatBoolean(value: boolean) {
  return value ? '有货架' : '无货架'
}

function formatLiftEnabled(value: boolean) {
  return value ? '启动' : '关闭'
}

function formatCoilValue(value: boolean | null | undefined, loading: boolean) {
  if (typeof value === 'boolean')
    return value ? 'ON' : 'OFF'

  return loading ? '读取中...' : '未读取'
}

function formatReadSource(source: ShelfState['source']) {
  if (source === 'desktop-modbus')
    return '桌面直连 Modbus TCP :502'

  if (source === 'http')
    return '控制器 HTTP API'

  return '未读取'
}

function formatLiveStatus(status: string, connected: boolean) {
  if (connected)
    return '已连接'

  const statusLabels: Record<string, string> = {
    idle: '未启动',
    starting: '连接中...',
    connecting: '连接中...',
    subscribed: '已订阅',
    stopped: '已停止',
    error: '连接错误',
    'decode-error': '解析错误',
    'missing-controller': '未选择控制器',
    'desktop-only': '仅桌面应用支持',
  }

  return statusLabels[status] || status || '未启动'
}

function formatMotorNumber(value: number, fractionDigits = 0) {
  if (!Number.isFinite(value))
    return '--'

  return fractionDigits > 0 ? value.toFixed(fractionDigits) : `${value}`
}

function formatMotorFlags(motor: MotorStateMessage) {
  const flags = [
    motor.isEnabled ? '使能' : '未使能',
    motor.isPowered ? '上电' : '未上电',
    motor.isConnected ? '已连接' : '未连接',
  ]
  if (motor.isFaulted)
    flags.push('故障')

  return flags.join(' / ')
}

const ShelfStateModal: React.FC<ShelfStateModalProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shelfPresent, setShelfPresent] = useState(false)
  const [stock, setStock] = useState('0')
  const [liftEnabled, setLiftEnabled] = useState(false)
  const [liftTargetHeight, setLiftTargetHeight] = useState('0')
  const [coil804, setCoil804] = useState<boolean | null>(null)
  const [coil805, setCoil805] = useState<boolean | null>(null)
  const [coil806, setCoil806] = useState<boolean | null>(null)
  const [coil807, setCoil807] = useState<boolean | null>(null)
  const [savingControlCoil, setSavingControlCoil] = useState<number | null>(null)
  const [savingControlAction, setSavingControlAction] = useState<string | null>(null)
  const [publishingActuatorReset, setPublishingActuatorReset] = useState(false)
  const [state, setState] = useState<ShelfState | null>(null)
  const liftingMotorStates = useLiftingMotorStatesZenoh()
  const controlBusy = loading || saving || savingControlCoil !== null || savingControlAction !== null || publishingActuatorReset

  const applyShelfState = (nextState: ShelfState) => {
    setState(nextState)
    setShelfPresent(nextState.shelf_present)
    setStock(`${nextState.stock}`)
    setLiftEnabled(nextState.lift_enabled)
    setLiftTargetHeight(`${nextState.lift_target_height}`)
    setCoil804(typeof nextState.coil_804 === 'boolean' ? nextState.coil_804 : null)
    setCoil805(typeof nextState.coil_805 === 'boolean' ? nextState.coil_805 : null)
    setCoil806(typeof nextState.coil_806 === 'boolean' ? nextState.coil_806 : null)
    setCoil807(typeof nextState.coil_807 === 'boolean' ? nextState.coil_807 : null)
  }

  const loadShelfState = async () => {
    setLoading(true)
    try {
      const response = await apiServer.fetchShelfState()
      if (response.code !== 0 || !response.data) {
        toast.error(response.message || '读取外设状态失败')
        return
      }

      applyShelfState(response.data)
    }
    catch (error) {
      toast.error(`读取外设状态失败 ${error}`)
    }
    finally {
      setLoading(false)
    }
  }

  const handleControlCoil = async (address: 804 | 805, value: boolean) => {
    setSavingControlCoil(address)
    try {
      const response = await apiServer.updateModbusCoil(address, value)

      if (response.code !== 0 || !response.data) {
        toast.error(response.message || `写入线圈 ${address} 失败`)
        return
      }

      if (address === 804) {
        setCoil804(response.data.value)
        setState(current => current ? { ...current, coil_804: response.data.value } : current)
      }
      else {
        setCoil805(response.data.value)
        setState(current => current ? { ...current, coil_805: response.data.value } : current)
      }

      toast.success(`线圈 ${address} 已更新`)
    }
    catch (error) {
      toast.error(`写入线圈 ${address} 失败 ${error}`)
    }
    finally {
      setSavingControlCoil(null)
    }
  }

  const handleControlAction = async (action: ControlCoilAction) => {
    setSavingControlAction(action.id)
    try {
      const response = await apiServer.updateModbusCoilSequence(action.steps)

      if (response.code !== 0 || !response.data) {
        toast.error(response.message || `${action.label}失败`)
        return
      }

      applyShelfState(response.data)
      toast.success(`${action.label}已执行`)
    }
    catch (error) {
      toast.error(`${action.label}失败 ${error}`)
    }
    finally {
      setSavingControlAction(null)
    }
  }

  const handleActuatorReset = async () => {
    setPublishingActuatorReset(true)
    try {
      const response = await apiServer.publishActuatorReset()

      if (response.code !== 0) {
        toast.error(response.message || '发布 /actuators/reset 失败')
        return
      }

      toast.success('已发布 /actuators/reset')
    }
    catch (error) {
      toast.error(`发布 /actuators/reset 失败 ${error}`)
    }
    finally {
      setPublishingActuatorReset(false)
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
        toast.error(response.message || '写入外设状态失败')
        return
      }

      applyShelfState(response.data)
      toast.success('Modbus 状态已更新')
    }
    catch (error) {
      toast.error(`写入外设状态失败 ${error}`)
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-(justify-center items-center) bg-gray-900/30">
      <div className="max-h-[90vh] w-34rem max-w-90vw overflow-auto rounded-2xl bg-white p-5 shadow-xl border-(solid 1px gray-200)">
        <div className="flex items-center">
          <div className="i-material-symbols-inventory-2-outline-rounded mr-2 text-6 text-emerald-700" />
          <div>
            <div className="text-5 font-bold">机器人外设状态</div>
            <div className="text-xs text-gray-500">Modbus TCP :502</div>
            <div className="text-xs text-gray-500">读取来源: {formatReadSource(state?.source)}</div>
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
          <div className="mt-3 rounded-lg border-(solid 1px gray-200) bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-gray-700">升降电机 Zenoh</div>
              <div className={liftingMotorStates.connected ? 'text-emerald-700' : 'text-gray-500'}>
                {formatLiveStatus(liftingMotorStates.status, liftingMotorStates.connected)}
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              订阅: {liftingMotorStates.key || '<namespace>/lifting_motor/states'}
            </div>
            {liftingMotorStates.updatedAt && (
              <div className="mt-1 text-xs text-gray-500">
                更新: {new Date(liftingMotorStates.updatedAt).toLocaleTimeString()}
              </div>
            )}
            {liftingMotorStates.error && (
              <div className="mt-2 text-xs text-red-600">{liftingMotorStates.error}</div>
            )}
            {!liftingMotorStates.message && !liftingMotorStates.error && (
              <div className="mt-2 text-xs text-gray-500">等待数据...</div>
            )}
            {liftingMotorStates.message?.motorStates.map(motor => (
              <div key={`${motor.id}-${motor.name}`} className="mt-3 rounded-md bg-gray-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-gray-700">
                    {motor.name || `Motor ${motor.id}`}
                  </div>
                  <div className={motor.isFaulted ? 'text-red-600' : 'text-emerald-700'}>
                    {formatMotorFlags(motor)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>ID: {motor.id}</div>
                  <div>电压: {formatMotorNumber(motor.voltage, 2)} V</div>
                  <div>速度: {formatMotorNumber(motor.speed)}</div>
                  <div>位置: {formatMotorNumber(motor.position)}</div>
                  <div>温度: {formatMotorNumber(motor.temperature)} ℃</div>
                  <div>负载: {formatMotorNumber(motor.payload)}</div>
                  <div>错误码: {motor.errorCode}</div>
                  <div>错误: {motor.errorMessage || '--'}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 font-bold text-gray-700">控制线圈</div>
          <div className="mt-1">线圈 804: {formatCoilValue(coil804, loading)}</div>
          <div className="mt-1">线圈 805: {formatCoilValue(coil805, loading)}</div>
          <div className="mt-1">线圈 806: {formatCoilValue(coil806, loading)}</div>
          <div className="mt-1">线圈 807: {formatCoilValue(coil807, loading)}</div>
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

        <div className="mt-5 border-t-(solid 1px gray-200) pt-4">
          <div className="mb-3 text-sm font-bold text-gray-700">控制线圈</div>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="font-bold text-gray-700">线圈 804</span>
            <div className="flex gap-2">
              <select
                className="w-22 rounded-md border-(solid 1px gray-300) bg-gray-50 px-2 py-1"
                value={coil804 === true ? 'true' : 'false'}
                disabled={controlBusy}
                onChange={event => setCoil804(event.target.value === 'true')}>
                <option value="true">ON</option>
                <option value="false">OFF</option>
              </select>
              <button
                type="button"
                className="rounded-md border-(solid 1px gray-300) px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                disabled={controlBusy || coil804 === null}
                onClick={() => handleControlCoil(804, coil804 === true)}>
                {savingControlCoil === 804 ? '写入中...' : '写入'}
              </button>
            </div>
          </label>

          <label className="mt-3 flex items-center justify-between gap-4 text-sm">
            <span className="font-bold text-gray-700">线圈 805</span>
            <div className="flex gap-2">
              <select
                className="w-22 rounded-md border-(solid 1px gray-300) bg-gray-50 px-2 py-1"
                value={coil805 === true ? 'true' : 'false'}
                disabled={controlBusy}
                onChange={event => setCoil805(event.target.value === 'true')}>
                <option value="true">ON</option>
                <option value="false">OFF</option>
              </select>
              <button
                type="button"
                className="rounded-md border-(solid 1px gray-300) px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                disabled={controlBusy || coil805 === null}
                onClick={() => handleControlCoil(805, coil805 === true)}>
                {savingControlCoil === 805 ? '写入中...' : '写入'}
              </button>
            </div>
          </label>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {controlCoilActions.map(action => (
              <button
                key={action.id}
                type="button"
                className="rounded-md border-(solid 1px gray-300) px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                disabled={controlBusy}
                onClick={() => handleControlAction(action)}>
                {savingControlAction === action.id ? '执行中...' : action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 border-t-(solid 1px gray-200) pt-4">
          <div className="mb-3 text-sm font-bold text-gray-700">执行器</div>
          <button
            type="button"
            className="w-full rounded-md border-(solid 1px red-200) bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
            disabled={controlBusy}
            onClick={handleActuatorReset}>
            {publishingActuatorReset ? '发布中...' : '复位执行器'}
          </button>
        </div>

        <div className="mt-5 flex justify-between">
          <button
            type="button"
            className="rounded-md border-(solid 1px gray-300) px-3 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={controlBusy}
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
              disabled={controlBusy}
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
