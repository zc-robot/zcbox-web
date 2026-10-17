import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import type { unstable_BlockerFunction as BlockerFunction } from 'react-router-dom'
import { unstable_useBlocker as useBlocker } from 'react-router-dom'
import MapInfoModal from './MapInfoModal'
import CameraStreamControls from '@/components/CameraStreamControls'
import ControllerDeck from '@/components/ControllerDeck'
import LidarScanControls from '@/components/LidarScanControls'
import PointCloudControls from '@/components/PointCloudControls'
import { RobotToolButton, RobotToolGroup } from '@/components/RobotToolbar'
import { useGridStore } from '@/store'
import apiServer from '@/service/apiServer'
import Monitor from '@/components/map/Monitor'
import { parseFiniteNumber, parseRobotStatus } from '@/util'

const Mapping: React.FC = () => {
  const [showModal, setShowModal] = useState<boolean>(false)
  const [isMapping, setIsMapping] = useState<boolean>(false)
  const [showViewTools, setShowViewTools] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showViewTools)
      return
    const dismiss = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node))
        setShowViewTools(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [showViewTools])
  const shouldBlocker = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    return isMapping && currentLocation.pathname !== nextLocation.pathname
  }, [isMapping])
  const blocker = useBlocker(shouldBlocker)

  const { resetGrid, zoom, robotStatus, updateRobotFsm, updateLocalizationQuality, isScanVisible, setScanVisibility, updateScanPointSize, zenohTelemetryStatus } = useGridStore(state => ({
    resetGrid: state.resetGrid,
    zoom: state.zoom,
    robotStatus: state.robotInfo?.fsm,
    updateRobotFsm: state.updateRobotFsm,
    updateLocalizationQuality: state.updateLocalizationQuality,
    isScanVisible: state.isScanVisible,
    setScanVisibility: state.setScanVisibility,
    updateScanPointSize: state.updateScanPointSize,
    zenohTelemetryStatus: state.zenohTelemetryStatus,
  }))
  const isMapZenohConnected = zenohTelemetryStatus === 'subscribed'

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
    <div className="flex flex-(col 1) h-full min-w-0">
      <div className="robot-toolbar" ref={toolbarRef}>
        <div className="robot-toolbar-header">
          <div className="robot-toolbar-heading">
            <strong>建图</strong>
            <span className={`robot-toolbar-connection${robotState === ReadyState.OPEN ? ' is-connected' : ''}`} title={robotState === ReadyState.OPEN ? `机器人已连接：${robotStatus || '等待状态'}` : '机器人未连接'} />
            <span className={`robot-toolbar-connection${isMapZenohConnected ? ' is-connected' : ''}`} title={isMapZenohConnected ? '地图已连接' : '等待地图'} />
          </div>
          <button type="button" className="robot-toolbar-menu-button" aria-expanded={showViewTools} aria-controls="mapping-view-tools" onClick={() => setShowViewTools(current => !current)}>视图与图层</button>
          <div className="robot-toolbar-actions" role="group" aria-label="建图操作">
            <RobotToolButton label="保存地图" icon="i-material-symbols-save-rounded" onClick={handleSaveClicked} tone="primary" />
            <RobotToolButton label={isMapping ? '停止建图' : '继续建图'} icon={isMapping ? 'i-material-symbols-stop-circle-rounded' : 'i-material-symbols-play-circle-rounded'} onClick={handleToggleClicked} tone={isMapping ? 'warning' : undefined} />
          </div>
        </div>
        {showViewTools && (
          <div id="mapping-view-tools" className="robot-toolbar-tools" onKeyDown={event => event.key === 'Escape' && setShowViewTools(false)}>
            <button type="button" className="robot-tool-menu-close" aria-label="关闭工具菜单" onClick={() => setShowViewTools(false)}>×</button>
            <RobotToolGroup label="地图视图">
              <RobotToolButton label="放大" icon="i-material-symbols-zoom-in-rounded" onClick={zoomInClick} />
              <RobotToolButton label="缩小" icon="i-material-symbols-zoom-out-rounded" onClick={zoomOutClick} />
            </RobotToolGroup>
            <RobotToolGroup label="激光扫描">
              <RobotToolButton label={isScanVisible ? '隐藏扫描' : '显示扫描'} icon="i-material-symbols-sensors-rounded" active={isScanVisible} onClick={toggleScanVisibility} />
              {isScanVisible && (
                <>
                  <LidarScanControls />
                  <RobotToolButton label="减小点" icon="i-material-symbols-remove-rounded" onClick={decreaseScanPointSize} />
                  <RobotToolButton label="增大点" icon="i-material-symbols-add-rounded" onClick={increaseScanPointSize} />
                </>
              )}
            </RobotToolGroup>
            <RobotToolGroup label="点云与相机"><PointCloudControls /><CameraStreamControls /></RobotToolGroup>
          </div>
        )}
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
