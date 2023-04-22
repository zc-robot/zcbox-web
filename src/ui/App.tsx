import React, { useEffect, useRef, useState } from 'react'
import { Provider } from "react-redux"
import Monitor from "./Monitor"
import { store } from "@/store"
import Panel from "./Panel"

const App: React.FC = () => {

  const monitorRef = useRef<HTMLDivElement>(null)
  const [monitorSize, setMonitorSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const monitor = monitorRef.current

    if (monitor?.offsetHeight && monitor?.offsetWidth) {
      setMonitorSize({
        width: monitor.offsetWidth,
        height: monitor.offsetHeight
      })
    }
  }, [])

  return (
    <Provider store={store}>
      <div flex flex-col h-full>
        <Panel />
        <div flex-auto ref={monitorRef}>
          <Monitor width={monitorSize.width} height={monitorSize.height} />
        </div>
      </div>
    </Provider>
  )
}

export default App
