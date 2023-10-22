import React, { useEffect } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import toast from 'react-hot-toast'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'
import type { RobotInfoMessage } from '@/types'

export interface TopDeckProps {
  mapId: number
}

const TopDeck: React.FC<TopDeckProps> = ({ mapId }) => {
  const { setMaps, zoom, robotStatus, setRobotInfo, setMapGrid } = useGridStore(state => ({
    setMaps: state.setMaps,
    zoom: state.zoom,
    robotStatus: state.robotInfo?.fsm,
    setRobotInfo: state.setRobotInfo,
    setMapGrid: state.setMapGrid,
  }))
  const { currentOp, updateOp } = useOperationStore(state => ({
    currentOp: state.current,
    updateOp: state.updateOp,
  }))
  const { currentProfile, currentTask, addProfiles } = useProfileStore(state => ({
    currentProfile: state.currentProfile,
    currentTask: state.getCurrentTask,
    addProfiles: state.addProfiles,
  }))

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  const wsOption = {
    shouldReconnect: (event: CloseEvent) => event.code !== 1000,
    reconnectAttempts: 10,
    reconnectInterval: 2000,
    retryOnError: true,
  }
  const { lastMessage, readyState } = useWebSocket(`${apiServer.wsDomain}/robot_data`, wsOption)

  useEffect(() => {
    if (lastMessage !== null) {
      try {
        const msg = JSON.parse(lastMessage.data) as RobotInfoMessage
        setRobotInfo(msg)
      }
      catch (e) {
        console.error('Failed to parse robot data', lastMessage.data, e)
      }
    }
  }, [lastMessage, setRobotInfo])

  const handleFetchClicked = async () => {
    const data = await apiServer.fetchMap(mapId)
    const mapData = data.data
    const profiles = data.deployment
    setMapGrid(mapData.data, mapData.info)
    addProfiles(profiles)
    toast.success('地图数据获取成功')
  }

  const handleSubmitClicked = async () => {
    // Submit task
    const profile = currentProfile()
    if (!profile)
      return

    const task = currentTask()
    if (task) {
      await apiServer.submitTask({
        deploy_id: profile.uid,
        uid: task.uid,
        data: task,
      })
    }

    // Submit profile
    const points = profile.data.waypoints
    const paths = profile.data.paths
    try {
      await apiServer.submitProfile({
        map_id: mapId,
        uid: profile.uid,
        name: profile.name,
        description: profile.description,
        waypoints: points,
        paths,
      })
      toast.success('保存成功')
    }
    catch (e) {
      toast.error(`保存失败 ${e}`)
    }
  }

  const handleDeleteClicked = async () => {
    // eslint-disable-next-line no-alert
    const answer = confirm('确定删除地图？')
    if (answer) {
      await apiServer.deleteMap(mapId)
      const maps = await apiServer.fetchMapList()
      setMaps(maps)
    }
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
        <div className="panel-item justify-center group">
          <div className={`${readyState === ReadyState.OPEN
            ? 'border-green'
            : 'border-red'} border-(3px solid) rd-3px self-center`} />
          <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
            {`机器人: ${robotStatus ?? '未连接'}`}
          </span>
        </div>
        <div
          className="panel-item group"
          onClick={handleFetchClicked}>
          <div className="i-material-symbols-download-rounded panel-icon" />
          <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
            获取地图数据
          </span>
        </div>
        <div
          className="panel-item group"
          onClick={handleSubmitClicked}>
          <div
            className="i-material-symbols-upload-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">保存</span>
        </div>
        <div
          className="panel-item group"
          onClick={handleDeleteClicked}>
          <div
            className="i-material-symbols-delete-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">删除</span>
        </div>
      </div>
    </div>
  )
}

export default TopDeck
