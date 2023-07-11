import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import type { unstable_BlockerFunction as BlockerFunction } from 'react-router-dom'
import { unstable_useBlocker as useBlocker } from 'react-router-dom'
import MapInfoModal from './MapInfoModal'
import ControllerDeck from '@/components/ControllerDeck'
import { useGridStore } from '@/store'
import type { OccupancyGridMessage, RobotInfoMessage } from '@/types'
import apiServer from '@/service/apiServer'
import Monitor from '@/components/map/Monitor'

const Mapping: React.FC = () => {
  const [showModal, setShowModal] = useState<boolean>(false)
  const [isMapping, setIsMapping] = useState<boolean>(false)
  const shouldBlocker = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    return isMapping && currentLocation.pathname !== nextLocation.pathname
  }, [isMapping])
  const blocker = useBlocker(shouldBlocker)

  const { resetGrid, zoom, robotStatus, setMapGrid, setRobotInfo } = useGridStore(state => ({
    resetGrid: state.resetGrid,
    zoom: state.zoom,
    robotStatus: state.robotInfo?.fsm,
    setMapGrid: state.setMapGrid,
    setRobotInfo: state.setRobotInfo,
  }))

  const wsOption = {
    shouldReconnect: (event: CloseEvent) => event.code !== 1000,
    reconnectAttempts: 10,
    reconnectInterval: 2000,
    retryOnError: true,
  }
  const { lastMessage: mapMessage, readyState: mapState } = useWebSocket(`${apiServer.wsDomain}/map`, wsOption)
  const { lastMessage: robotMessage, readyState: robotState } = useWebSocket(`${apiServer.wsDomain}/robot_data`, wsOption)

  useEffect(() => {
    if (robotMessage != null) {
      try {
        const msg = JSON.parse(robotMessage.data) as RobotInfoMessage
        setRobotInfo(msg)
      }
      catch (e) {
        console.error('Failed to parse robot data', robotMessage.data, e)
      }
    }
  }, [robotMessage, setRobotInfo])

  useEffect(() => {
    if (mapMessage != null) {
      try {
        const msg = JSON.parse(mapMessage.data) as OccupancyGridMessage
        setMapGrid(msg.data, msg.info)
      }
      catch (e) {
        console.error('Failed to parse map data', mapMessage.data, e)
      }
    }
  }, [mapMessage, setMapGrid])

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
  }, [blocker.state, resetGrid])

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

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
            <div className={`${mapState === ReadyState.OPEN
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
