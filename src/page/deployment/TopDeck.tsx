import React, { useEffect } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import toast from 'react-hot-toast'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'
import type { PointMessage, RobotInfoMessage } from '@/types'
import { useBatteryStateMqtt, useKeyPress, useLaserScanMqtt, useRobotPoseMqtt } from '@/hooks'
import { parsePgm } from '@/util/transform'
import { buildRmfBuildingYaml, sanitizeRmfFileName } from '@/util/rmf'

export interface TopDeckProps {
  mapId: number
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return element != null && (
    element.tagName === 'INPUT'
    || element.tagName === 'TEXTAREA'
    || element.isContentEditable
  )
}

const TopDeck: React.FC<TopDeckProps> = ({ mapId }) => {
  useRobotPoseMqtt()
  useBatteryStateMqtt()
  useLaserScanMqtt()
  const { zoom, robotInfo, robotStatus, setRobotInfo, setMapGrid, setPathPointInfo, mapsNew, isScanVisible, setScanVisibility, updateScanPointSize, requestCenterRobot, relocalizationPose, beginRelocalization, cancelRelocalization } = useGridStore(state => ({
    zoom: state.zoom,
    robotInfo: state.robotInfo,
    robotStatus: state.robotInfo?.fsm,
    setRobotInfo: state.setRobotInfo,
    setMapGrid: state.setMapGrid,
    setPathPointInfo: state.setPathPointInfo,
    mapsNew: state.mapsNew,
    isScanVisible: state.isScanVisible,
    setScanVisibility: state.setScanVisibility,
    updateScanPointSize: state.updateScanPointSize,
    requestCenterRobot: state.requestCenterRobot,
    relocalizationPose: state.relocalizationPose,
    beginRelocalization: state.beginRelocalization,
    cancelRelocalization: state.cancelRelocalization,
  }))
  const { currentOp, selectPoint, updateOp, openPointEditor } = useOperationStore(state => ({
    currentOp: state.current,
    selectPoint: state.selectPoint,
    updateOp: state.updateOp,
    openPointEditor: state.openPointEditor,
  }))
  const { currentProfile, currentTask, addProfiles, appendCurrentProfilePointFromPose } = useProfileStore(state => ({
    currentProfile: state.currentProfile,
    currentTask: state.getCurrentTask,
    addProfiles: state.addProfiles,
    appendCurrentProfilePointFromPose: state.appendCurrentProfilePointFromPose,
  }))

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)
  const toggleScanVisibility = () => setScanVisibility(!isScanVisible)
  const increaseScanPointSize = () => updateScanPointSize(0.01)
  const decreaseScanPointSize = () => updateScanPointSize(-0.01)
  const activateSelectMode = () => updateOp('select')
  const activateManualWaypointPlacement = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    openPointEditor(null)
    updateOp('waypoint')
  }
  const activatePathMode = () => updateOp('pathway')
  const activateDoorMode = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    updateOp('door')
  }
  const activateLiftMode = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    updateOp('lift')
  }

  const captureRobotWaypoint = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    if (!robotInfo) {
      toast.error('暂无机器人位姿')
      return
    }

    const id = appendCurrentProfilePointFromPose(robotInfo.pose)
    if (!id) {
      toast.error('路径点创建失败')
      return
    }

    openPointEditor(id)
    selectPoint(id)
    toast.success('已采集当前位置为路径点')
  }

  const toggleRelocalization = () => {
    if (currentOp === 'relocalize') {
      cancelRelocalization()
      updateOp('move')
      return
    }

    if (!robotInfo) {
      toast.error('暂无机器人位姿')
      return
    }

    if (!isScanVisible)
      setScanVisibility(true)

    beginRelocalization()
    updateOp('relocalize')
  }

  const handleRelocalizationConfirm = async () => {
    if (!relocalizationPose) {
      toast.error('暂无重定位位姿')
      return
    }

    const loadingToast = toast.loading('正在发送重定位...')
    try {
      await apiServer.setPose(relocalizationPose)
      toast.dismiss(loadingToast)
      toast.success('重定位已发送')
      cancelRelocalization()
      updateOp('move')
    }
    catch (error) {
      toast.dismiss(loadingToast)
      toast.error(`重定位失败 ${error}`)
    }
  }

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
      requestCenterRobot()
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
    const doors = profile.data.doors ?? []
    const lifts = profile.data.lifts ?? []
    try {
      await apiServer.submitProfile({
        map_id: mapId,
        uid: profile.uid,
        name: profile.name,
        description: profile.description,
        waypoints: points,
        paths,
        doors,
        lifts,
      })
      toast.success('保存成功')
    }
    catch (e) {
      toast.error(`保存失败 ${e}`)
    }
  }

  const handleGenerateRmfClicked = () => {
    const profile = currentProfile()
    if (!profile) {
      toast.error('请先选择配置')
      return
    }

    const mapName = mapsNew.find(map => map.id === mapId)?.name ?? `map-${mapId}`
    const buildingName = `${mapName}-${profile.name}`
    const content = buildRmfBuildingYaml(profile, {
      buildingName,
    })
    const blob = new Blob([content], { type: 'application/x-yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${sanitizeRmfFileName(buildingName)}.building.yaml`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success('RMF配置文件已生成')
  }

  useKeyPress((event, isDown) => {
    if (isDown) {
      if (event.ctrlKey)
        handleSubmitClicked()
    }
  }, ['s', 'S'])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    event.preventDefault()
    activateSelectMode()
  }, ['Escape'])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    event.preventDefault()
    activatePathMode()
  }, ['l', 'L'])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    event.preventDefault()
    activateManualWaypointPlacement()
  }, ['v', 'V'])

  useEffect(() => {
    return () => {
      cancelRelocalization()
      updateOp('move')
    }
  }, [cancelRelocalization, updateOp])

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
          onClick={activateSelectMode}>
          <div className="i-material-symbols-near-me-outline-rounded panel-icon rotate-y-180" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">选择 (Esc)</span>
        </div>
        <div
          className="panel-item group bg-blue-600 hover:bg-blue-700"
          onClick={captureRobotWaypoint}>
          <div className="i-material-symbols-add-location-outline panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">添加路径点</span>
        </div>
        <div
          className={`${currentOp === 'waypoint' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={activateManualWaypointPlacement}>
          <div className="i-material-symbols-my-location-outline-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">手动放置路径点 (V)</span>
        </div>
        <div
          className={`${currentOp === 'pathway' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={activatePathMode}>
          <div className="i-material-symbols-edit-road-outline-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">添加路径 (L)</span>
        </div>
        <div
          className={`${currentOp === 'door' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={activateDoorMode}>
          <div className="i-material-symbols-door-front-outline-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">添加门</span>
        </div>
        <div
          className={`${currentOp === 'lift' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={activateLiftMode}>
          <div className="i-material-symbols-elevator-outline-rounded panel-icon" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">添加电梯</span>
        </div>
        <div
          className={`${currentOp === 'relocalize' ? 'panel-item-enabled' : 'panel-item'} group`}
          onClick={toggleRelocalization}>
          <div className="i-material-symbols-location-on-outline panel-icon text-white" />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
            {currentOp === 'relocalize' ? '关闭重定位' : '重定位'}
          </span>
        </div>
        {currentOp === 'relocalize' && (
          <div
            className="panel-item group bg-green-600 hover:bg-green-700"
            onClick={handleRelocalizationConfirm}>
            <div className="i-material-symbols-check-small panel-icon text-white" />
            <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
              发送重定位
            </span>
          </div>
        )}
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
          <div className={`${isScanVisible ? 'i-material-symbols-sensors-rounded' : 'i-material-symbols-sensors-off-rounded'} panel-icon`} />
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
            {isScanVisible ? '隐藏扫描' : '显示扫描'}
          </span>
        </div>
        {isScanVisible && (
          <>
            <div
              className="panel-item group"
              onClick={decreaseScanPointSize}>
              <div className="i-material-symbols-remove-rounded panel-icon" />
              <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
                减小扫描点
              </span>
            </div>
            <div
              className="panel-item group"
              onClick={increaseScanPointSize}>
              <div className="i-material-symbols-add-rounded panel-icon" />
              <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
                增大扫描点
              </span>
            </div>
          </>
        )}
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
          className="panel-item group w-auto min-w-2.5rem gap-1 px-3 bg-emerald-700 hover:bg-emerald-800 items-center"
          onClick={handleGenerateRmfClicked}>
          <div
            className="i-material-symbols-description-outline-rounded panel-icon" />
          <span className="mr-1 text-sm font-medium whitespace-nowrap">生成RMF配置文件</span>
          <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible whitespace-nowrap">生成RMF配置文件</span>
        </div>
      </div>
    </div>
  )
}

export default TopDeck
