import React, { useState } from 'react'
import { useGridStore, useNavigationStore, useOperationStore } from '@/store'
import { useInterval } from '@/hooks'

const Breadcrumb: React.FC = () => {
  const zoom = useGridStore(state => state.zoom)
  const fetchMapGrid = useGridStore(state => state.fetchMapGrid)
  const fetchRobotData = useGridStore(state => state.fetchRobotPose)
  const currentOp = useOperationStore(state => state.current)
  const updateOp = useOperationStore(state => state.updateOp)
  const submitNavInfo = useNavigationStore(state => state.submitNavInfo)

  const [pollingGrid, setPollingGrid] = useState(false)
  const [pollingRobot, setPollingRobot] = useState(false)

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  const handleSubmitClicked = async () => {
    await submitNavInfo()
  }

  useInterval(async () => {
    await fetchMapGrid()
  }, pollingGrid ? 2000 : undefined)

  useInterval(async () => {
    await fetchRobotData()
  }, pollingRobot ? 2000 : undefined)

  return (
    <div panel-container>
      <div flex>
        <div
          className={currentOp === 'move' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('move')}>
          <div i-material-symbols:back-hand-outline-rounded panel-icon />
        </div>
        <div
          className={currentOp === 'select' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('select')}>
          <div i-material-symbols:near-me-outline-rounded panel-icon rotate-y-180 />
        </div>
        <div
          className={currentOp === 'waypoint' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('waypoint')}>
          <div i-material-symbols:my-location-outline-rounded panel-icon />
        </div>
        <div
          className={currentOp === 'pathway' ? 'panel-item-enabled' : 'panel-item'}
          onClick={() => updateOp('pathway')}>
          <div i-material-symbols:edit-road-outline-rounded panel-icon />
        </div>
      </div>
      <div flex>
        <div panel-item
          onClick={zoomInClick}>
          <div i-material-symbols:zoom-in-rounded panel-icon />
        </div>
        <div panel-item
          onClick={zoomOutClick}>
          <div i-material-symbols:zoom-out-rounded panel-icon />
        </div>
        <div panel-item
          onClick={() => setPollingGrid(!pollingGrid)}>
          <div
            className={pollingGrid
              ? 'i-material-symbols:pause-circle-outline-rounded'
              : 'i-material-symbols:map-outline-rounded'}
            panel-icon />
        </div>
        <div panel-item
          onClick={() => setPollingRobot(!pollingRobot)}>
          <div
            className={pollingRobot
              ? 'i-material-symbols:pause-circle-outline-rounded'
              : 'i-material-symbols:smart-toy-outline-rounded'}
            panel-icon />
        </div>
        <div panel-item
          onClick={handleSubmitClicked}>
          <div
            i-material-symbols:upload-rounded
            panel-icon />
        </div>
      </div>
    </div>
  )
}

export default Breadcrumb
