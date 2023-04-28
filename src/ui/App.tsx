import React, { useEffect, useRef, useState } from 'react'
import Monitor from './Monitor'
import Breadcrumb from './Breadcrumb'
import InfoDeck from './InfoDeck'
import TaskDeck from './TaskDeck'
import { useOperationStore } from '@/store'

const App: React.FC = () => {
  const monitorRef = useRef<HTMLDivElement>(null)
  const [monitorSize, setMonitorSize] = useState({ width: 0, height: 0 })
  const currentOp = useOperationStore(state => state.current)

  useEffect(() => {
    const monitor = monitorRef.current

    if (monitor?.offsetHeight && monitor?.offsetWidth) {
      setMonitorSize({
        width: monitor.offsetWidth,
        height: monitor.offsetHeight,
      })
    }
  }, [])

  return (
    <div flex flex-col h-full>
      <Breadcrumb />
      <div flex flex-auto>
        <InfoDeck />
        <div flex-1
          className={currentOp === 'move' ? 'cursor-pointer' : ''}
          ref={monitorRef}>
          <Monitor width={monitorSize.width} height={monitorSize.height} />
        </div>
        <TaskDeck />
      </div>
    </div>
  )
}

export default App
