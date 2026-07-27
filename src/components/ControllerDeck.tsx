import { useCallback, useEffect, useState } from 'react'
import { round } from 'lodash'
import { shallow } from 'zustand/shallow'
import { useGridStore, useOperationStore } from '@/store'
import { useInterval, useKeyPress, useVelocityCommandZenoh } from '@/hooks'
import apiServer from '@/service/apiServer'
import type { PoseMessage, RobotStatus } from '@/types'

function formatDisplayValue(value: number) {
  return value.toFixed(2)
}

function formatVelocityValue(value: number) {
  return String(round(Number.isFinite(value) ? value : 0, 2))
}

function parseVelocityValue(value: string) {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue))
    return null

  return round(Math.max(parsedValue, 0), 2)
}

const VelocityInput: React.FC<{
  iconClassName: string
  label: string
  step: number
  value: number
  onCommit: (value: number) => void
}> = ({ iconClassName, label, step, value, onCommit }) => {
  const [draftValue, setDraftValue] = useState(formatVelocityValue(value))
  const [isEditing, setEditing] = useState(false)

  useEffect(() => {
    if (!isEditing)
      setDraftValue(formatVelocityValue(value))
  }, [isEditing, value])

  const commitDraftValue = useCallback(() => {
    const parsedValue = parseVelocityValue(draftValue)
    if (parsedValue === null) {
      setDraftValue(formatVelocityValue(value))
      return
    }

    onCommit(parsedValue)
    setDraftValue(formatVelocityValue(parsedValue))
  }, [draftValue, onCommit, value])

  return (
    <div className="flex flex-items-center pt-2">
      <div className={`${iconClassName} text-5`} />
      <i className="text-3 mr-2">{label}</i>
      <input
        className="flex-grow w-20"
        type="number"
        min={0}
        step={step}
        value={draftValue}
        onBlur={() => {
          setEditing(false)
          commitDraftValue()
        }}
        onChange={(event) => { setDraftValue(event.target.value) }}
        onFocus={() => { setEditing(true) }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          else if (event.key === 'Escape') {
            setDraftValue(formatVelocityValue(value))
            event.currentTarget.blur()
          }
        }}
        onKeyUp={(event) => { event.stopPropagation() }}
      />
    </div>
  )
}

const Panel: React.FC = () => {
  const step = 0.02
  const { velocityInfo, updateLineVelocity, updateAngularVelocity } = useOperationStore(state => ({
    velocityInfo: state.velocityInfo,
    updateLineVelocity: state.updateLineVelocity,
    updateAngularVelocity: state.updateAngularVelocity,
  }), shallow)
  const [pressedKey, pressKey] = useState<string>('')
  const publishVelocityCommand = useVelocityCommandZenoh()

  const confirmStatus = async () => {
    await apiServer.confirmStatus()
  }

  const stopVelocityCommand = useCallback(() => {
    publishVelocityCommand()
    pressKey('')
  }, [publishVelocityCommand])

  useKeyPress((event, isDown) => {
    if (isDown) {
      if (event.shiftKey) {
        switch (event.key.toUpperCase()) {
          case 'W':
            updateLineVelocity(round(velocityInfo.line + step, 2))
            break
          case 'S':
            updateLineVelocity(round(velocityInfo.line - step, 2))
            break
          case 'A':
            updateAngularVelocity(round(velocityInfo.angular - step, 2))
            break
          case 'D':
            updateAngularVelocity(round(velocityInfo.angular + step, 2))
        }
      }
      else {
        pressKey(event.key.toLowerCase())
      }
    }
    else {
      if (!event.shiftKey)
        stopVelocityCommand()
    }
  }, ['w', 's', 'a', 'd', 'q', 'e', 'z', 'c', 'W', 'S', 'A', 'D'])

  useEffect(() => {
    const handleBlur = () => {
      stopVelocityCommand()
    }

    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [stopVelocityCommand])

  useInterval(async () => {
    switch (pressedKey) {
      case 'w':
        publishVelocityCommand({ linearX: velocityInfo.line })
        break
      case 's':
        publishVelocityCommand({ linearX: -velocityInfo.line })
        break
      case 'a':
        publishVelocityCommand({ angularZ: velocityInfo.angular })
        break
      case 'd':
        publishVelocityCommand({ angularZ: -velocityInfo.angular })
        break
      case 'q':
        publishVelocityCommand({ linearX: velocityInfo.line, angularZ: velocityInfo.angular })
        break
      case 'e':
        publishVelocityCommand({ linearX: velocityInfo.line, angularZ: -velocityInfo.angular })
        break
      case 'z':
        publishVelocityCommand({ linearY: velocityInfo.line })
        break
      case 'c':
        publishVelocityCommand({ linearY: -velocityInfo.line })
        break
    }
  }, pressedKey === '' ? undefined : 50)

  return (
    <div className="p-2 flex flex-col justify-center items-center">
      <div className="flex flex-(justify-center items-center)">
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'q' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('q')}
          onPointerUp={stopVelocityCommand}
          onPointerOut={stopVelocityCommand}>
          <i className="i-material-symbols-arrow-upward-rounded ma rotate-315" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'w' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('w')}
          onPointerUp={stopVelocityCommand}
          onPointerOut={stopVelocityCommand}>
          <i className="i-material-symbols-arrow-upward-rounded ma" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'e' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('e')}
          onPointerUp={stopVelocityCommand}
          onPointerOut={stopVelocityCommand}>
          <i className="i-material-symbols-arrow-upward-rounded ma rotate-45" />
        </div>
      </div>
      <div className="flex flex-(justify-center items-center)">
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'a' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('a')}
          onPointerUp={stopVelocityCommand}
          onPointerLeave={stopVelocityCommand}
          onPointerOut={stopVelocityCommand}>
          <i className="i-material-symbols-arrow-back-rounded ma" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 's' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('s')}
          onPointerUp={stopVelocityCommand}
          onPointerLeave={stopVelocityCommand}
          onPointerOut={stopVelocityCommand}>
          <i className="i-material-symbols-arrow-downward-rounded ma" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'd' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('d')}
          onPointerUp={stopVelocityCommand}
          onPointerLeave={stopVelocityCommand}
          onPointerOut={stopVelocityCommand}>
          <i className="i-material-symbols-arrow-forward-rounded ma" />
        </div>
      </div>
      <VelocityInput
        iconClassName="i-material-symbols-line-end-arrow-outline-rounded"
        label="线速度"
        step={step}
        value={velocityInfo.line}
        onCommit={updateLineVelocity}
      />
      <VelocityInput
        iconClassName="i-material-symbols-rotate-right-rounded"
        label="角速度"
        step={step}
        value={velocityInfo.angular}
        onCommit={updateAngularVelocity}
      />
      <div
        className="border-(solid 1px gray-5) rounded mt-2 p-2 text-3 cursor-default"
        onClick={confirmStatus}>
        确认机器人位置
      </div>
    </div>
  )
}

const Info: React.FC<{
  pose: PoseMessage | null
  status: RobotStatus
  qulity: number
  battery: number | null
  batteryCurrent: number | null
  battery2: number | null
  battery2Current: number | null
}> = ({
  pose,
  status,
  qulity,
  battery,
  batteryCurrent,
  battery2,
  battery2Current,
}) => {
  const formatPoseValue = (value?: number) => value == null ? '--' : formatDisplayValue(value)
  const formatMetricValue = (value: number | null, suffix: string) => value == null ? '--' : `${formatDisplayValue(value)}${suffix}`

  return (
    <div className="p-2 flex flex-col border-(t-solid 1px gray-300)">
      <div className="flex text-sm text-dark font-bold pl-1">状态:
        <span className="text-dark font-200">{status}</span>
      </div>
      <div className="flex text-sm text-dark font-bold pl-1 pt-1">电量:
        <span className="text-dark font-200">{formatMetricValue(battery, '%')}</span>
        <span className="pl-3">电流:
          <span className="text-dark font-200">{formatMetricValue(batteryCurrent, 'A')}</span>
        </span>
      </div>
      <div className="flex text-sm text-dark font-bold pl-1 pt-1">电量2:
        <span className="text-dark font-200">{formatMetricValue(battery2, '%')}</span>
        <span className="pl-3">电流2:
          <span className="text-dark font-200">{formatMetricValue(battery2Current, 'A')}</span>
        </span>
      </div>
      <div className="flex text-sm text-dark font-bold pl-1 pt-1">质量:
        <span className="text-dark font-200">{qulity}</span>
      </div>
      <div className="flex text-sm pt-2">
        <div className="pl-2 font-bold">X:
          <span className="text-dark font-200">{formatPoseValue(pose?.position.x)}</span>
        </div>
        <div className="pl-2 font-bold">Y:
          <span className="text-dark font-200">{formatPoseValue(pose?.position.y)}</span>
        </div>
        <div className="pl-2 font-bold">Z:
          <span className="text-dark font-200">{formatPoseValue(pose?.position.z)}</span>
        </div>
      </div>
      <div className="flex flex-col text-sm">
        <div className="pl-2 pt-1 font-bold">Yaw:
          <br/>
          <span className="text-dark font-200">{formatPoseValue(pose?.pyr.yaw)}</span>
        </div>
      </div>
    </div>
  )
}

const ControllerDeck: React.FC = () => {
  const [isDeckDisplay, displayDeck] = useState(false)
  const {
    hasLivePose,
    hasLiveBattery,
    hasLiveBattery2,
    battery2,
    battery2Current,
    robotInfo,
    relocalizationPose,
  } = useGridStore(state => ({
    hasLivePose: state.hasLivePose,
    hasLiveBattery: state.hasLiveBattery,
    hasLiveBattery2: state.hasLiveBattery2,
    battery2: state.battery2,
    battery2Current: state.battery2Current,
    robotInfo: state.robotInfo,
    relocalizationPose: state.relocalizationPose,
  }))
  const currentOp = useOperationStore(state => state.current)

  return (
    <div className="flex='grow-0 shrink-0 basis-a'">
      {(robotInfo || window.zcDesktop?.isDesktop) && (
        <Info
          pose={hasLivePose ? robotInfo?.pose ?? null : null}
          status={robotInfo?.fsm ?? 'idle'}
          qulity={robotInfo?.localization_quality ?? 0}
          battery={hasLiveBattery ? robotInfo?.battery ?? null : null}
          batteryCurrent={hasLiveBattery ? robotInfo?.batteryCurrent ?? null : null}
          battery2={hasLiveBattery2 ? battery2 : null}
          battery2Current={hasLiveBattery2 ? battery2Current : null}
        />
      )}
      {currentOp === 'relocalize' && relocalizationPose && (
        <div className="p-2 flex flex-col border-(t-solid 1px gray-300) text-sm">
          <div className="flex items-center font-bold pl-1">
            <div className="i-material-symbols-location-on-outline text-4 mr-1 text-blue-6" />
            <span>重定位目标:</span>
            <span className="font-200 pl-1">X {formatDisplayValue(relocalizationPose.position.x)}</span>
            <span className="font-200 pl-2">Y {formatDisplayValue(relocalizationPose.position.y)}</span>
          </div>
          <div className="font-bold pl-1 pt-1">Yaw:
            <span className="font-200 pl-1">{formatDisplayValue(relocalizationPose.pyr.yaw)}</span>
          </div>
          <div className="flex items-start text-3 text-gray-6 pl-1 pt-2">
            <div className="i-material-symbols-back-hand-outline-rounded text-4 mr-1 text-blue-6 shrink-0" />
            <span>
            拖动机器人并旋转蓝色手柄，对齐扫描后点击顶部对勾发送。
            </span>
          </div>
        </div>
      )}
      <div className="flex flex-(items-center justify-between) px-4 h-8 border-(t-solid b-solid 1px gray-300)"
        onClick={() => displayDeck(!isDeckDisplay)}>
        <div className="text-3 p-1 cursor-default font-bold">机器人操作</div>
        <div className="i-material-symbols-keyboard-arrow-up" />
      </div>
      {isDeckDisplay && <Panel />}
    </div>
  )
}

export default ControllerDeck
