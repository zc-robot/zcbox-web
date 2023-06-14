import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import ControllerDeck from '../deployment/ControllerDeck'
import MapInfoModal from './MapInfoModal'
import Monitor from '@/components/map/Monitor'
import Websocket from '@/service/websocket'
import { useGridStore } from '@/store'
import type { OccupancyGridMessage, RobotInfoMessage } from '@/types'
import apiServer from '@/service/apiServer'

const Mapping: React.FC = () => {
  const mapWs = useRef<Websocket | null>(null)
  const robotWs = useRef<Websocket | null>(null)
  const [showModal, setShowModal] = useState<boolean>(false)
  const resetGrid = useGridStore(state => state.resetGrid)
  const zoom = useGridStore(state => state.zoom)
  const setMapGrid = useGridStore(state => state.setMapGrid)
  const setRobotPose = useGridStore(state => state.setRobotPose)

  const initWebsocket = useCallback(() => {
    if (!mapWs.current) {
      const client = Websocket.connect('map', (state, data) => {
        if (state === 'connected') {
          const msg = JSON.parse(data) as OccupancyGridMessage
          setMapGrid(msg.data, msg.info)
        }
      })
      mapWs.current = client
    }
    if (!robotWs.current) {
      const client = Websocket.connect('robot_data', (state, data) => {
        if (state === 'connected') {
          const msg = JSON.parse(data) as RobotInfoMessage
          setRobotPose(msg.pose)
        }
      })
      robotWs.current = client
    }
  }, [mapWs, robotWs, setMapGrid, setRobotPose])

  const fetchData = useCallback(async () => {
    await apiServer.mapping(5)
  }, [])

  useLayoutEffect(() => {
    initWebsocket()
    fetchData()
    return () => {
      mapWs.current?.close()
      robotWs.current?.close()
      resetGrid()
    }
  }, [mapWs, robotWs, initWebsocket, resetGrid])

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  const handleSaveClicked = async () => {
    setShowModal(true)
  }

  return (
    <div className="flex flex-(col 1) h-full">
      <div className="bg-dark-300 flex flex-reverse">
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
      <div className="flex flex-auto">
        <Monitor />
        <div className="flex flex-col w-12rem border-(l-solid 1px gray-300)">
          <ControllerDeck />
        </div>
        <MapInfoModal
          visible={showModal}
          onClose={() => setShowModal(false)} />
      </div>
    </div>
  )
}

export default Mapping