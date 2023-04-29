import React from 'react'
import Monitor from './map/Monitor'
import Breadcrumb from './Breadcrumb'
import InfoDeck from './info/InfoDeck'
import TaskDeck from './task/TaskDeck'

const App: React.FC = () => {
  return (
    <div flex flex-col h-full>
      <Breadcrumb />
      <div flex flex-auto>
        <InfoDeck />
        <Monitor />
        <TaskDeck />
      </div>
    </div>
  )
}

export default App
