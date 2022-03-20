import React, { useEffect } from 'react'
import './App.css'
import { Provider } from "react-redux"
import { store } from "src/store"
import ros from "src/lib/ros"

const App: React.FC = () => {

  const connectRos = async () => {
    ros.connect("ws://localhost:9090")
    ros.subscribeMap()
  }

  useEffect(() => {
    connectRos()
  }, [])

  return (
    <Provider store={store}>
    </Provider>
  )
}

export default App
