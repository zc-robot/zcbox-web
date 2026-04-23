import { useCallback, useEffect, useState } from 'react'
import { round, toNumber, toString } from 'lodash'
import { shallow } from 'zustand/shallow'
import { useGridStore, useOperationStore } from '@/store'
import { useInterval, useKeyPress, useVelocityCommandMqtt } from '@/hooks'
import apiServer from '@/service/apiServer'
import type { PoseMessage, RobotStatus } from '@/types'

function formatDisplayValue(value: number) {
  return value.toFixed(2)
}

const Panel: React.FC = () => {
  const step = 0.02
  const { velocityInfo, updateLineVelocity, updateAngularVelocity } = useOperationStore(state => ({
    velocityInfo: state.velocityInfo,
    updateLineVelocity: state.updateLineVelocity,
    updateAngularVelocity: state.updateAngularVelocity,
  }), shallow)
  const [pressedKey, pressKey] = useState<string>('')
  const publishVelocityCommand = useVelocityCommandMqtt()

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
      <div className="flex flex-items-center pt-2">
        <div className="i-material-symbols-line-end-arrow-outline-rounded text-5" />
        <i className="text-3 mr-2">线速度</i>
        <input
          className="flex-grow w-20"
          type="number"
          min={0}
          step={step}
          value={toString(velocityInfo.line)}
          onChange={(e) => { updateLineVelocity(round(toNumber(e.target.value), 2)) }}
        />
      </div>
      <div className="flex flex-items-center pt-2">
        <div className="i-material-symbols-rotate-right-rounded text-5" />
        <i className="text-3 mr-2">角速度</i>
        <input
          className="flex-grow w-20"
          type="number"
          min={0}
          step={step}
          value={toString(velocityInfo.angular)}
          onChange={(e) => { updateAngularVelocity(round(toNumber(e.target.value), 2)) }}
        />
      </div>
      <div
        className="border-(solid 1px gray-5) rounded mt-2 p-2 text-3 cursor-default"
        onClick={confirmStatus}>
        确认机器人位置
      </div>
    </div>
  )
}

const Info: React.FC<{ pose: PoseMessage; status: RobotStatus; qulity: number; battery: number; batteryCurrent: number }> = ({ pose, status, qulity, battery, batteryCurrent }) => {
  return (
    <div className="p-2 flex flex-col border-(t-solid 1px gray-300)">
      <div className="flex text-sm text-dark font-bold pl-1">状态:
        <span className="text-dark font-200">{status}</span>
      </div>
      <div className="flex text-sm text-dark font-bold pl-1 pt-1">电量:
        <span className="text-dark font-200">{formatDisplayValue(battery)}%</span>
        <span className="pl-3">电流:
          <span className="text-dark font-200">{formatDisplayValue(batteryCurrent)}A</span>
        </span>
      </div>
      <div className="flex text-sm text-dark font-bold pl-1 pt-1">质量:
        <span className="text-dark font-200">{qulity}</span>
      </div>
      <div className="flex text-sm pt-2">
        <div className="pl-2 font-bold">X:
          <span className="text-dark font-200">{formatDisplayValue(pose.position.x)}</span>
        </div>
        <div className="pl-2 font-bold">Y:
          <span className="text-dark font-200">{formatDisplayValue(pose.position.y)}</span>
        </div>
        <div className="pl-2 font-bold">Z:
          <span className="text-dark font-200">{formatDisplayValue(pose.position.z)}</span>
        </div>
      </div>
      <div className="flex flex-col text-sm">
        <div className="pl-2 pt-1 font-bold">Yaw:
          <br/>
          <span className="text-dark font-200">{formatDisplayValue(pose.pyr.yaw)}</span>
        </div>
      </div>
    </div>
  )
}

const ControllerDeck: React.FC = () => {
  const [isDeckDisplay, displayDeck] = useState(false)
  const { robotInfo, relocalizationPose } = useGridStore(state => ({
    robotInfo: state.robotInfo,
    relocalizationPose: state.relocalizationPose,
  }))
  const currentOp = useOperationStore(state => state.current)

  return (
    <div className="flex='grow-0 shrink-0 basis-a'">
      {robotInfo && <Info pose={robotInfo.pose} status={robotInfo.fsm} qulity={robotInfo.localization_quality} battery={robotInfo.battery} batteryCurrent={robotInfo.batteryCurrent}/>}
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
