import React from 'react'
import Monitor from './map/Monitor'
import Breadcrumb from './Breadcrumb'
import InfoDeck from './info/InfoDeck'
import TaskDeck from './task/TaskDeck'
import ControllerDeck from './controller/ControllerDeck'

const App: React.FC = () => {
  return (
    <div flex='~ col' h-full>
      <Breadcrumb />
      <div flex='~ auto'>
        <InfoDeck />
        <Monitor />
        <div flex='~ col' w-12rem border='l-solid 1px gray-300'>
          <TaskDeck />
          <ControllerDeck />
        </div>
      </div>
    </div>
  )
}

export default App
