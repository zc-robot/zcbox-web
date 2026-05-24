import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import type { unstable_BlockerFunction as BlockerFunction } from 'react-router-dom'
import { unstable_useBlocker as useBlocker } from 'react-router-dom'
import MapInfoModal from './MapInfoModal'
import ControllerDeck from '@/components/ControllerDeck'
import { useGridStore } from '@/store'
import apiServer from '@/service/apiServer'
import Monitor from '@/components/map/Monitor'
import { useBatteryStateMqtt, useCompressedMapMqtt, useLaserScanMqtt, usePointCloudZenoh, useRobotPoseMqtt, useRobotPoseZenoh } from '@/hooks'
import { parseFiniteNumber, parseRobotStatus } from '@/util'

const Mapping: React.FC = () => {
  useRobotPoseZenoh()
  useRobotPoseMqtt()
  useBatteryStateMqtt()
  useLaserScanMqtt()
  usePointCloudZenoh()
  const isMapMqttConnected = useCompressedMapMqtt()
  const [showModal, setShowModal] = useState<boolean>(false)
  const [isMapping, setIsMapping] = useState<boolean>(false)
  const shouldBlocker = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    return isMapping && currentLocation.pathname !== nextLocation.pathname
  }, [isMapping])
  const blocker = useBlocker(shouldBlocker)

  const { resetGrid, zoom, robotStatus, updateRobotFsm, updateLocalizationQuality, isScanVisible, setScanVisibility, updateScanPointSize, isPointCloudVisible, setPointCloudVisibility, updatePointCloudPointSize } = useGridStore(state => ({
    resetGrid: state.resetGrid,
    zoom: state.zoom,
    robotStatus: state.robotInfo?.fsm,
    updateRobotFsm: state.updateRobotFsm,
    updateLocalizationQuality: state.updateLocalizationQuality,
    isScanVisible: state.isScanVisible,
    setScanVisibility: state.setScanVisibility,
    updateScanPointSize: state.updateScanPointSize,
    isPointCloudVisible: state.isPointCloudVisible,
    setPointCloudVisibility: state.setPointCloudVisibility,
    updatePointCloudPointSize: state.updatePointCloudPointSize,
  }))

  const wsOption = {
    shouldReconnect: (event: CloseEvent) => event.code !== 1000,
    reconnectAttempts: 100,
    reconnectInterval: 2000,
    retryOnError: true,
  }
  const { lastMessage: robotFsmMessage, readyState: robotState } = useWebSocket(apiServer.robotFsmWsUrl, wsOption)
  const { lastMessage: localizationQualityMessage } = useWebSocket(apiServer.localizationQualityWsUrl, wsOption)

  useEffect(() => {
    if (robotFsmMessage != null) {
      const status = parseRobotStatus(robotFsmMessage.data)
      if (status)
        updateRobotFsm(status)
      else
        console.error('Failed to parse robot FSM', robotFsmMessage.data)
    }

    if (localizationQualityMessage != null) {
      const quality = parseFiniteNumber(localizationQualityMessage.data)
      if (quality != null)
        updateLocalizationQuality(quality)
      else
        console.error('Failed to parse localization quality', localizationQualityMessage.data)
    }
  }, [localizationQualityMessage, robotFsmMessage, updateLocalizationQuality, updateRobotFsm])

  useEffect(() => {
    if (blocker.state === 'blocked') {
      // eslint-disable-next-line no-alert
      const answer = confirm('当前正在建图，离开页面将会丢失地图数据，是否继续？')
      if (answer)
        blocker.proceed?.()
      else
        blocker.reset?.()
    }
  }, [blocker])

  useLayoutEffect(() => {
    const fetchData = async () => {
      await apiServer.startMapping()
      setIsMapping(true)
    }
    fetchData()
    return () => {
      resetGrid()
    }
  }, [resetGrid])

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)
  const toggleScanVisibility = () => setScanVisibility(!isScanVisible)
  const increaseScanPointSize = () => updateScanPointSize(0.01)
  const decreaseScanPointSize = () => updateScanPointSize(-0.01)
  const togglePointCloudVisibility = () => setPointCloudVisibility(!isPointCloudVisible)
  const increasePointCloudPointSize = () => updatePointCloudPointSize(0.01)
  const decreasePointCloudPointSize = () => updatePointCloudPointSize(-0.01)

  const handleSaveClicked = async () => {
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
  }

  const handleToggleClicked = async () => {
    if (isMapping) {
      await apiServer.stopMapping()
      resetGrid()
      setIsMapping(false)
    }
    else {
      await apiServer.startMapping()
      setIsMapping(true)
    }
  }

  return (
    <div className="flex flex-(col 1) h-full">
      <div className="bg-dark-300 flex justify-between">
        <div className="flex">
          <div
            className="panel-item group"
            onClick={zoomInClick}>
            <div className="i-material-symbols-zoom-in-rounded panel-icon" />
            <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">放大</span>
          </div>
          <div
            className="panel-item group"
            onClick={zoomOutClick}>
            <div className="i-material-symbols-zoom-out-rounded panel-icon" />
            <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">缩小</span>
          </div>
          <div
            className="panel-item group"
            onClick={handleSaveClicked}>
            <div className="i-material-symbols-save-rounded panel-icon" />
            <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">保存</span>
          </div>
          <div
            className={`${isScanVisible ? 'panel-item-enabled' : 'panel-item'} group`}
            onClick={toggleScanVisibility}>
            <div className={`${isScanVisible ? 'i-material-symbols-sensors-rounded' : 'i-material-symbols-sensors-off-rounded'} panel-icon`} />
            <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
              {isScanVisible ? '隐藏扫描' : '显示扫描'}
            </span>
          </div>
          {isScanVisible && (
            <>
              <div
                className="panel-item group"
                onClick={decreaseScanPointSize}>
                <div className="i-material-symbols-remove-rounded panel-icon" />
                <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
                  减小扫描点
                </span>
              </div>
              <div
                className="panel-item group"
                onClick={increaseScanPointSize}>
                <div className="i-material-symbols-add-rounded panel-icon" />
                <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
                  增大扫描点
                </span>
              </div>
            </>
          )}
          <div
            className={`${isPointCloudVisible ? 'panel-item-enabled' : 'panel-item'} group`}
            onClick={togglePointCloudVisibility}>
            <div className="i-material-symbols-grain-rounded panel-icon" />
            <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible whitespace-nowrap">
              {isPointCloudVisible ? '隐藏点云' : '显示点云'}
            </span>
          </div>
          {isPointCloudVisible && (
            <>
              <div
                className="panel-item group"
                onClick={decreasePointCloudPointSize}>
                <div className="i-material-symbols-remove-rounded panel-icon" />
                <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible whitespace-nowrap">
                  减小点云点
                </span>
              </div>
              <div
                className="panel-item group"
                onClick={increasePointCloudPointSize}>
                <div className="i-material-symbols-add-rounded panel-icon" />
                <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible whitespace-nowrap">
                  增大点云点
                </span>
              </div>
            </>
          )}
        </div>
        <div className="flex">
          <div
            className="panel-item group"
            onClick={handleToggleClicked}>
            <div className={`${isMapping ? 'i-material-symbols-stop-circle-rounded' : 'i-material-symbols-play-circle-rounded'} panel-icon`} />
            <span className="group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">{isMapping ? '停止' : '开启'}</span>
          </div>
          <div className="panel-item justify-center group">
            <div className={`${robotState === ReadyState.OPEN
              ? 'border-green'
              : 'border-red'} border-(3px solid) rd-3px self-center`} />
              <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">
                {`机器人: ${robotStatus ?? '未连接'}`}
              </span>
          </div>
          <div className="panel-item justify-center group">
            <div className={`${isMapMqttConnected
              ? 'border-green'
              : 'border-red'} border-(3px solid) rd-3px self-center`}/>
              <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible">地图</span>
          </div>
        </div>
      </div>
      <div className="flex flex-auto">
        <Monitor />
        <div className="flex h-100% flex-col w-12rem border-(l-solid 1px gray-300)">
          <ControllerDeck />
        </div>
        {showModal && <MapInfoModal
          onClose={handleModalClose} />}
      </div>
    </div>
  )
}

export default Mapping
