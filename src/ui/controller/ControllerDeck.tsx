import { useState } from 'react'
import { useOperationStore } from '@/store'
import { useInterval, useKeyPress } from '@/hooks'

const _panel: React.FC = () => {
  const velocityInfo = useOperationStore(state => state.velocityInfo)
  const updateLineVelocity = useOperationStore(state => state.updateLineVelocity)
  const updateAngularVelocity = useOperationStore(state => state.updateAngularVelocity)
  const sendRobotVelocity = useOperationStore(state => state.sendRobotVelocity)
  const [pressedKey, pressKey] = useState<string>('')

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
    switch (pressedKey) {
      case 'w':
        await sendRobotVelocity(velocityInfo.line, 0.0)
        break
      case 's':
        await sendRobotVelocity(-velocityInfo.line, 0.0)
        break
      case 'a':
        await sendRobotVelocity(0.0, -velocityInfo.angular)
        break
      case 'd':
        await sendRobotVelocity(0.0, velocityInfo.angular)
    }
  }, pressedKey === '' ? undefined : 500)

  return (
    <div p-2 flex='~ col justify-center items-center'>
      <div flex='~ justify-center items-center'>
        <div w-4 h-4 border='solid 1px gray-5' rounded p-1
          onPointerDown={() => pressKey('w')}
          onPointerUp={() => pressKey('')}
          onPointerOut={() => pressKey('')}
          className={pressedKey === 'w' ? 'bg-gray-3' : ''}>
          <i i-material-symbols-arrow-upward-rounded ma />
        </div>
      </div>
      <div flex='~ justify-center items-center'>
        <div w-4 h-4 border='solid 1px gray-5' rounded p-1
          onPointerDown={() => pressKey('a')}
          onPointerUp={() => pressKey('')}
          onPointerLeave={() => pressKey('')}
          onPointerOut={() => pressKey('')}
          className={pressedKey === 'a' ? 'bg-gray-3' : ''}>
          <i i-material-symbols-arrow-back-rounded ma />
        </div>
        <div w-4 h-4 border='solid 1px gray-5' rounded p-1
          onPointerDown={() => pressKey('s')}
          onPointerUp={() => pressKey('')}
          onPointerLeave={() => pressKey('')}
          onPointerOut={() => pressKey('')}
          className={pressedKey === 's' ? 'bg-gray-3' : ''}>
          <i i-material-symbols-arrow-downward-rounded ma />
        </div>
        <div w-4 h-4 border='solid 1px gray-5' rounded p-1
          onPointerDown={() => pressKey('d')}
          onPointerUp={() => pressKey('')}
          onPointerLeave={() => pressKey('')}
          onPointerOut={() => pressKey('')}
          className={pressedKey === 'd' ? 'bg-gray-3' : ''}>
          <i i-material-symbols-arrow-forward-rounded ma />
        </div>
      </div>
      <div flex='~ items-center' pt-2>
        <div i-material-symbols-line-end-arrow-outline-rounded text-5 />
        <i text-3 mr-2>线速度</i>
        <input
          flex-grow
          w-20
          type='number'
          min={0}
          step={0.1}
          value={velocityInfo.line}
          onChange={e => updateLineVelocity(Number(e.target.value))}
        />
      </div>
      <div flex='~ items-center' py-2>
        <div i-material-symbols-rotate-right-rounded text-5 />
        <i text-3 mr-2>角速度</i>
        <input
          flex-grow
          w-20
          type='number'
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
    <div flex='grow-0 shrink-0 basis-a'>
      <div flex='~ items-center justify-between' px-4 h-8 border='t-solid b-solid 1px gray-300'
        onClick={() => displayDeck(!isDeckDisplay)}>
        <div text-3 p-1 cursor-default font-bold>机器人操作</div>
        <div i-material-symbols-keyboard-arrow-up />
      </div>
      {isDeckDisplay && <_panel />}
    </div>
  )
}

export default ControllerDeck
