import { useState } from 'react'
import { useWebSocket } from 'react-use-websocket/dist/lib/use-websocket'
import { ReadyState } from 'react-use-websocket'
import { useOperationStore } from '@/store'
import { useInterval, useKeyPress } from '@/hooks'
import apiServer from '@/service/apiServer'

const _panel: React.FC = () => {
  const step = 0.02
  const velocityInfo = useOperationStore(state => state.velocityInfo)
  const updateLineVelocity = useOperationStore(state => state.updateLineVelocity)
  const updateAngularVelocity = useOperationStore(state => state.updateAngularVelocity)
  const [pressedKey, pressKey] = useState<string>('')

  const { sendJsonMessage, readyState } = useWebSocket(`${apiServer.wsDomain}/velocity_control`)

  useKeyPress((event, isDown) => {
    if (isDown) {
      if (event.shiftKey) {
        switch (event.key) {
          case 'W':
            updateLineVelocity(velocityInfo.line + step)
            break
          case 'S':
            updateLineVelocity(velocityInfo.line - step)
            break
          case 'A':
            updateAngularVelocity(velocityInfo.angular - step)
            break
          case 'D':
            updateAngularVelocity(velocityInfo.angular + step)
        }
      }
      else {
        pressKey(event.key)
      }
    }
    else {
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
      <div className="flex items-center mb-5 justify-center text-sm self-start">连接状态{readyState === ReadyState.OPEN
        ? <span className="ml-1 text-green">已联通</span>
        : <span className="ml-1 text-red">未联通</span>}</div>
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
          value={velocityInfo.line}
          onChange={e => updateLineVelocity(Number.parseFloat(e.target.value))}
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
          value={velocityInfo.angular}
          onChange={e => updateAngularVelocity(Number.parseFloat(e.target.value))}
        />
      </div>
    </div>
  )
}

const ControllerDeck: React.FC = () => {
  const [isDeckDisplay, displayDeck] = useState(false)

  return (
    <div className="flex='grow-0 shrink-0 basis-a'">
      <div className="flex flex-(items-center justify-between) px-4 h-8 border-(t-solid b-solid 1px gray-300)"
        onClick={() => displayDeck(!isDeckDisplay)}>
        <div className="text-3 p-1 cursor-default font-bold">机器人操作</div>
        <div className="i-material-symbols-keyboard-arrow-up" />
      </div>
      {isDeckDisplay && <_panel />}
    </div>
  )
}

export default ControllerDeck
