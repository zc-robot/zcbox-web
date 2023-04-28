import React from 'react'
import Monitor from './Monitor'
import Breadcrumb from './Breadcrumb'
import InfoDeck from './InfoDeck'
import TaskDeck from './TaskDeck'

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
