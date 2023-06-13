import React from 'react'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'

export interface TopDeckProps {
  mapId: number
}

const TopDeck: React.FC<TopDeckProps> = ({ mapId }) => {
  const zoom = useGridStore(state => state.zoom)
  const currentOp = useOperationStore(state => state.current)
  const updateOp = useOperationStore(state => state.updateOp)

  const currentProfileId = useProfileStore(state => state.currentProfileId)
  const currentProfilePoints = useProfileStore(state => state.currentProfilePoints)
  const currentProfilePaths = useProfileStore(state => state.currentProfilePaths)
  const currentTask = useProfileStore(state => state.getCurrentTask)

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  const handleSubmitClicked = async () => {
    // Submit task
    if (!currentProfileId)
      return
    const task = currentTask()
    if (task)
      await apiServer.submitTasks({ deploy_id: currentProfileId, data: task })

    // Submit profile
    const points = currentProfilePoints()
    const paths = currentProfilePaths()
    await apiServer.submitProfile({
      map_id: mapId,
      waypoints: points,
      pathways: paths,
    })
  }

  return (
    <div className="panel-container">
      <div className="flex">
        <div
          className={`${currentOp === 'move' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={() => updateOp('move')}>
          <div className="i-material-symbols-back-hand-outline-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">移动</span>
        </div>
        <div
          className={`${currentOp === 'select' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={() => updateOp('select')}>
          <div className="i-material-symbols-near-me-outline-rounded panel-icon rotate-y-180" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">选择</span>
        </div>
        <div
          className={`${currentOp === 'waypoint' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={() => updateOp('waypoint')}>
          <div className="i-material-symbols-my-location-outline-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">添加路径点</span>
        </div>
        <div
          className={`${currentOp === 'pathway' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={() => updateOp('pathway')}>
          <div className="i-material-symbols-edit-road-outline-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">添加路径</span>
        </div>
      </div>
      <div className="flex">
        <div
          className="panel-item group"
          onClick={zoomInClick}>
          <div className="i-material-symbols-zoom-in-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">放大</span>
        </div>
        <div
          className="panel-item group"
          onClick={zoomOutClick}>
          <div className="i-material-symbols-zoom-out-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">缩小</span>
        </div>
        <div
          className="panel-item group"
          onClick={handleSubmitClicked}>
          <div
            className="i-material-symbols-upload-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">保存</span>
        </div>
      </div>
    </div>
  )
}

export default TopDeck
