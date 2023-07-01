import { useEffect, useLayoutEffect, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import ControllerDeck from '../deployment/ControllerDeck'
import MapInfoModal from './MapInfoModal'
import Monitor from '@/components/map/Monitor'
import { useGridStore } from '@/store'
import type { OccupancyGridMessage, RobotInfoMessage } from '@/types'
import apiServer from '@/service/apiServer'

const Mapping: React.FC = () => {
  const [showModal, setShowModal] = useState<boolean>(false)
  const resetGrid = useGridStore(state => state.resetGrid)
  const zoom = useGridStore(state => state.zoom)
  const robotStatus = useGridStore(state => state.robotInfo?.status)
  const setMapGrid = useGridStore(state => state.setMapGrid)
  const setRobotInfo = useGridStore(state => state.setRobotInfo)

  const wsOption = {
    shouldReconnect: (event: CloseEvent) => event.code !== 1000,
    reconnectAttempts: 10,
    reconnectInterval: 2000,
    retryOnError: true,
  }
  const { lastMessage: mapMessage, readyState: mapState } = useWebSocket(`${apiServer.wsDomain}/map`, wsOption)
  const { lastMessage: robotMessage, readyState: robotState } = useWebSocket(`${apiServer.wsDomain}/robot_data`, wsOption)

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
    if (robotMessage != null) {
      try {
        const msg = JSON.parse(robotMessage.data) as RobotInfoMessage
        setRobotInfo(msg)
      }
      catch (e) {
        console.error('Failed to parse robot data', robotMessage.data, e)
      }
    }
  }, [mapMessage, robotMessage, setMapGrid, setRobotInfo])

  useLayoutEffect(() => {
    const fetchData = async () => {
      await apiServer.mapping(5)
    }
    fetchData()
    return () => {
      resetGrid()
    }
  }, [resetGrid])

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  const handleSaveClicked = async () => {
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
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
        <div className="flex flex-col w-12rem border-(l-solid 1px gray-300)">
          <ControllerDeck />
        </div>
        <MapInfoModal
          visible={showModal}
          onClose={handleModalClose} />
      </div>
    </div>
  )
}

export default Mapping
