import { useState } from 'react'
import { useWebSocket } from 'react-use-websocket/dist/lib/use-websocket'
import { round, toNumber, toString } from 'lodash'
import { shallow } from 'zustand/shallow'
import { useGridStore, useOperationStore } from '@/store'
import { useInterval, useKeyPress } from '@/hooks'
import apiServer from '@/service/apiServer'
import type { PoseMessage, RobotStatus } from '@/types'

const Panel: React.FC = () => {
  const step = 0.02
  const { velocityInfo, updateLineVelocity, updateAngularVelocity } = useOperationStore(state => ({
    velocityInfo: state.velocityInfo,
    updateLineVelocity: state.updateLineVelocity,
    updateAngularVelocity: state.updateAngularVelocity,
  }), shallow)
  const [pressedKey, pressKey] = useState<string>('')

  const { sendJsonMessage } = useWebSocket(`${apiServer.wsDomain}/velocity_control`)
  const confirmStatus = async () => {
    await apiServer.confirmStatus()
  }

  useKeyPress((event, isDown) => {
    if (isDown) {
      if (event.shiftKey) {
        switch (event.key) {
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
        pressKey(event.key)
      }
    }
    else {
      if (event.shiftKey)
        return

      sendJsonMessage({ linear: 0, angular: 0.0 })
      pressKey('')
    }
  }, ['w', 's', 'a', 'd', 'q', 'e', 'W', 'S', 'A', 'D'])

  useInterval(async () => {
    switch (pressedKey) {
      case 'w':
        sendJsonMessage({ linear: velocityInfo.line, angular: 0.0 })
        break
      case 's':
        sendJsonMessage({ linear: -velocityInfo.line, angular: 0.0 })
        break
      case 'a':
        sendJsonMessage({ linear: 0.0, angular: velocityInfo.angular })
        break
      case 'd':
        sendJsonMessage({ linear: 0.0, angular: -velocityInfo.angular })
        break
      case 'q':
        sendJsonMessage({ linear: velocityInfo.line, angular: velocityInfo.angular })
        break
      case 'e':
        sendJsonMessage({ linear: velocityInfo.line, angular: -velocityInfo.angular })
        break
    }
  }, pressedKey === '' ? undefined : 50)

  return (
    <div className="p-2 flex flex-col justify-center items-center">
      <div className="flex flex-(justify-center items-center)">
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'q' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('q')}
          onPointerUp={() => pressKey('')}
          onPointerOut={() => pressKey('')}>
          <i className="i-material-symbols-arrow-upward-rounded ma rotate-315" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'w' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('w')}
          onPointerUp={() => pressKey('')}
          onPointerOut={() => pressKey('')}>
          <i className="i-material-symbols-arrow-upward-rounded ma" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'e' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('e')}
          onPointerUp={() => pressKey('')}
          onPointerOut={() => pressKey('')}>
          <i className="i-material-symbols-arrow-upward-rounded ma rotate-45" />
        </div>
      </div>
      <div className="flex flex-(justify-center items-center)">
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'a' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('a')}
          onPointerUp={() => pressKey('')}
          onPointerLeave={() => pressKey('')}
          onPointerOut={() => pressKey('')}>
          <i className="i-material-symbols-arrow-back-rounded ma" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 's' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('s')}
          onPointerUp={() => pressKey('')}
          onPointerLeave={() => pressKey('')}
          onPointerOut={() => pressKey('')}>
          <i className="i-material-symbols-arrow-downward-rounded ma" />
        </div>
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'd' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('d')}
          onPointerUp={() => pressKey('')}
          onPointerLeave={() => pressKey('')}
          onPointerOut={() => pressKey('')}>
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

const Info: React.FC<{ pose: PoseMessage; status: RobotStatus; qulity: number }> = ({ pose, status, qulity }) => {
  return (
    <div className="p-2 flex flex-col border-(t-solid 1px gray-300)">
      <div className="flex text-sm text-dark font-bold pl-1">状态:
        <span className="text-dark font-200">{status}</span>
      </div>
      <div className="flex text-sm text-dark font-bold pl-1 pt-1">质量:
        <span className="text-dark font-200">{qulity}</span>
      </div>
      <div className="flex text-sm pt-2">
        <div className="pl-2 font-bold">X:
          <span className="text-dark font-200">{pose.position.x}</span>
        </div>
        <div className="pl-2 font-bold">Y:
          <span className="text-dark font-200">{pose.position.y}</span>
        </div>
        <div className="pl-2 font-bold">Z:
          <span className="text-dark font-200">{pose.position.z}</span>
        </div>
      </div>
      <div className="flex flex-col text-sm">
        <div className="pl-2 pt-1 font-bold">Yaw:
          <br/>
          <span className="text-dark font-200">{pose.pyr.yaw}</span>
        </div>
      </div>
    </div>
  )
}

const ControllerDeck: React.FC = () => {
  const [isDeckDisplay, displayDeck] = useState(false)
  const robotInfo = useGridStore(state => state.robotInfo)

  return (
    <div className="flex='grow-0 shrink-0 basis-a'">
      {robotInfo && <Info pose={robotInfo.pose} status={robotInfo.fsm} qulity={robotInfo.localization_quality} />}
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
