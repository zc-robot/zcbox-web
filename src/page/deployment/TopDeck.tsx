import React, { useEffect } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'
import type { PointMessage, RobotInfoMessage } from '@/types'
import { useBatteryStateMqtt, useKeyPress, useLaserScanMqtt, useRobotPoseMqtt } from '@/hooks'
import { parsePgm } from '@/util/transform'

export interface TopDeckProps {
  mapId: number
}

const TopDeck: React.FC<TopDeckProps> = ({ mapId }) => {
  useRobotPoseMqtt()
  useBatteryStateMqtt()
  useLaserScanMqtt()
  const navigate = useNavigate()
  const { setMaps, setMapsNew, zoom, robotStatus, setRobotInfo, setMapGrid, setPathPointInfo, mapsNew, isScanVisible, setScanVisibility } = useGridStore(state => ({
    setMaps: state.setMaps,
    setMapsNew: state.setMapsNew,
    zoom: state.zoom,
    robotStatus: state.robotInfo?.fsm,
    setRobotInfo: state.setRobotInfo,
    setMapGrid: state.setMapGrid,
    setPathPointInfo: state.setPathPointInfo,
    mapsNew: state.mapsNew,
    isScanVisible: state.isScanVisible,
    setScanVisibility: state.setScanVisibility,
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
  const toggleScanVisibility = () => setScanVisibility(!isScanVisible)

  const wsOption = {
    shouldReconnect: (event: CloseEvent) => event.code !== 1000,
    reconnectAttempts: 100,
    reconnectInterval: 2000,
    retryOnError: true,
  }
  const { lastMessage: robotMessage, readyState: robotState } = useWebSocket(apiServer.robotDataWsUrl, wsOption)
  const { lastMessage: pathMessage } = useWebSocket(`${apiServer.wsDomain}/path_plan`, wsOption)

  useEffect(() => {
    if (robotMessage !== null) {
      try {
        const msg = JSON.parse(robotMessage.data) as RobotInfoMessage
        setRobotInfo(msg)
      }
      catch (e) {
        console.error('Failed to parse robot data', robotMessage.data, e)
      }
    }
    if (pathMessage !== null) {
      try {
        const msg = JSON.parse(pathMessage.data) as { path: PointMessage[] }
        setPathPointInfo(msg.path)
      }
      catch (e) {
        console.error('Failed to parse path data', pathMessage.data, e)
      }
    }
  }, [pathMessage, robotMessage, setPathPointInfo, setRobotInfo])

  const handleFetchClicked = async () => {
    try {
      const currentMap = await apiServer.fetchCurrentMap()
      const foundMap = mapsNew.find(map => map.id === currentMap.map_id)
      if (foundMap == null)
        return

      // 显示加载提示
      const loadingToast = toast.loading('正在加载地图数据...')

      const blob = await apiServer.downloadMap(foundMap.navigation_map_file_path)
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const pgmData = parsePgm(uint8Array)
      const mapData = pgmData.data

      // 获取部署配置
      const profiles = await apiServer.fetchMapDeployment(currentMap.map_id)

      // 更新状态（这会触发Redux DevTools的序列化，但我们已经添加了状态净化功能）
      setMapGrid(mapData, foundMap.info)
      addProfiles(profiles)

      // 关闭加载提示并显示成功消息
      toast.dismiss(loadingToast)
      toast.success('地图数据获取成功')
    }
    catch (error) {
      console.error('加载地图数据失败:', error)
      toast.error('加载地图数据失败')
    }
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
      try {
        const resp = await apiServer.deleteMap(mapId)
        if (resp.code !== 0) {
          toast.error(resp.message || '删除失败')
          return
        }

        const maps = await apiServer.fetchMapList()
        const mapsNew = await apiServer.fetchMapListNew()
        setMaps(maps)
        setMapsNew(mapsNew)
        toast.success('删除成功')
        navigate('/')
      }
      catch (e) {
        toast.error(`删除失败 ${e}`)
      }
    }
  }

  useKeyPress((event, isDown) => {
    if (isDown) {
      if (event.ctrlKey)
        handleSubmitClicked()
    }
  }, ['s', 'S'])

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
          className={`${isScanVisible ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={toggleScanVisibility}>
          <div className="i-material-symbols-radar-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
            {isScanVisible ? '隐藏扫描' : '显示扫描'}
          </span>
        </div>
        <div className="panel-item justify-center group">
          <div className={`${robotState === ReadyState.OPEN
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
