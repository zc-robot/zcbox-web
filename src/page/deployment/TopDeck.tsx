import React, { useState } from 'react'
import { useGridStore, useNavigationStore, useOperationStore, useTaskStore } from '@/store'
import { useInterval } from '@/hooks'

const TopDeck: React.FC = () => {
  const zoom = useGridStore(state => state.zoom)
  const fetchMapGrid = useGridStore(state => state.fetchMapGrid)
  const fetchRobotData = useGridStore(state => state.fetchRobotPose)
  const currentOp = useOperationStore(state => state.current)
  const updateOp = useOperationStore(state => state.updateOp)
  const submitNavInfo = useNavigationStore(state => state.submitNavInfo)
  const submitTasks = useTaskStore(state => state.submitTasks)
  const fetchNavInfo = useNavigationStore(state => state.fetchNavInfo)
  const fetchTasks = useTaskStore(state => state.fetchTasks)

  const [pollingGrid, setPollingGrid] = useState(false)
  const [pollingRobot, setPollingRobot] = useState(false)

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  const handleSubmitClicked = async () => {
    await submitTasks()
    await submitNavInfo()
  }

  const handleFetchClicked = async () => {
    await fetchNavInfo()
    await fetchTasks()
  }

  useInterval(async () => {
    await fetchMapGrid()
  }, pollingGrid ? 2000 : undefined)

  useInterval(async () => {
    await fetchRobotData()
  }, pollingRobot ? 2000 : undefined)

  return (
    <div className="panel-container">
      <div className="flex">
        <div
          className={currentOp === 'move' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('move')}>
          <div className="i-material-symbols-back-hand-outline-rounded panel-icon" />
        </div>
        <div
          className={currentOp === 'select' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('select')}>
          <div className="i-material-symbols-near-me-outline-rounded panel-icon rotate-y-180" />
        </div>
        <div
          className={currentOp === 'waypoint' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('waypoint')}>
          <div className="i-material-symbols-my-location-outline-rounded panel-icon" />
        </div>
        <div
          className={currentOp === 'pathway' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('pathway')}>
          <div className="i-material-symbols-edit-road-outline-rounded panel-icon" />
        </div>
      </div>
      <div
        className="flex">
        <div
          className="panel-item"
          onClick={zoomInClick}>
          <div className="i-material-symbols-zoom-in-rounded panel-icon" />
        </div>
        <div
          className="panel-item"
          onClick={zoomOutClick}>
          <div className="i-material-symbols-zoom-out-rounded panel-icon" />
        </div>
        <div
          className="panel-item"
          onClick={() => setPollingGrid(!pollingGrid)}>
          <div
            className={`panel-icon ${pollingGrid
              ? 'i-material-symbols-pause-circle-outline-rounded'
              : 'i-material-symbols-map-outline-rounded'}`} />
        </div>
        <div
          className="panel-item"
          onClick={() => setPollingRobot(!pollingRobot)}>
          <div
            className={`panel-icon ${pollingRobot
              ? 'i-material-symbols-pause-circle-outline-rounded'
              : 'i-material-symbols-smart-toy-outline-rounded'}`} />
        </div>
        <div
          className="panel-item"
          onClick={handleSubmitClicked}>
          <div
            className="i-material-symbols-upload-rounded panel-icon" />
        </div>
        <div
          className="panel-item"
          onClick={handleFetchClicked}>
          <div
            className="i-material-symbols-download-rounded panel-icon" />
        </div>
      </div>
    </div>
  )
}

export default TopDeck
