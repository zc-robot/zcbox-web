import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useOperationStore } from '@/store'
import { useInterval, useKeyPress } from '@/hooks'
import Websocket from '@/service/websocket'

const _panel: React.FC = () => {
  const velocityInfo = useOperationStore(state => state.velocityInfo)
  const updateLineVelocity = useOperationStore(state => state.updateLineVelocity)
  const updateAngularVelocity = useOperationStore(state => state.updateAngularVelocity)
  const [pressedKey, pressKey] = useState<string>('')
  const ws = useRef<Websocket | null>(null)
  const [wsConnected, setWsConnected] = useState<boolean>(false)

  const initWebsocket = useCallback(() => {
    if (!ws.current) {
      const client = Websocket.connect('velocity_control', (state) => {
        if (state === 'connected')
          setWsConnected(true)
        else
          setWsConnected(false)
      })
      ws.current = client
    }
  }, [ws])

  useLayoutEffect(() => {
    initWebsocket()
    return () => {
      ws.current?.close()
    }
  }, [ws, initWebsocket])

  useKeyPress((event, isDown) => {
    if (isDown) {
      if (event.shiftKey) {
        switch (event.key) {
          case 'W':
            updateLineVelocity(velocityInfo.line + 0.1)
            break
          case 'S':
            updateLineVelocity(velocityInfo.line - 0.1)
            break
          case 'A':
            updateAngularVelocity(velocityInfo.angular - 0.1)
            break
          case 'D':
            updateAngularVelocity(velocityInfo.angular + 0.1)
        }
      }
      else {
        pressKey(event.key)
      }
    }
    else { pressKey('') }
  }, ['w', 's', 'a', 'd', 'W', 'S', 'A', 'D'])

  useInterval(async () => {
    if (!ws.current)
      return
    switch (pressedKey) {
      case 'w':
        ws.current.send({ linear: velocityInfo.line, angular: 0.0 })
        break
      case 's':
        ws.current.send({ linear: -velocityInfo.line, angular: 0.0 })
        break
      case 'a':
        ws.current.send({ linear: 0.0, angular: velocityInfo.angular })
        break
      case 'd':
        ws.current.send({ linear: 0.0, angular: -velocityInfo.angular })
    }
  }, pressedKey === '' ? undefined : 50)

  return (
    <div className="p-2 flex flex-col justify-center items-center">
      <div className="flex items-center mb-5 justify-center text-sm self-start">连接状态{wsConnected
        ? <span className="ml-1 text-green">已联通</span>
        : <span className="ml-1 text-red">未联通</span>}</div>
      <div className="flex flex-(justify-center items-center)">
        <div className={`w-4 h-4 border-(solid 1px gray-5) rounded p-1 ${pressedKey === 'w' ? 'bg-gray-3' : ''}`}
          onPointerDown={() => pressKey('w')}
          onPointerUp={() => pressKey('')}
          onPointerOut={() => pressKey('')}>
          <i className="i-material-symbols-arrow-upward-rounded ma" />
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
          step={0.1}
          value={velocityInfo.line}
          onChange={e => updateLineVelocity(Number(e.target.value))}
        />
      </div>
      <div className="flex flex-items-center pt-2">
        <div className="i-material-symbols-rotate-right-rounded text-5" />
        <i className="text-3 mr-2">角速度</i>
        <input
          className="flex-grow w-20"
          type="number"
          min={0}
          step={0.1}
          value={velocityInfo.angular}
          onChange={e => updateAngularVelocity(Number(e.target.value))}
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
