import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const [wsState, setWsState] = useState({
    map: 'disconnected',
    robot: 'disconnected',
  })

  const setupMapWs = () => {
    mapWs.current?.close()

    const mapClient = Websocket.connect('map', (state, data) => {
      switch (state) {
        case 'connected':
          setWsState(state => ({ ...state, map: 'connected' }))
          if (data) {
            try {
              const msg = JSON.parse(data) as OccupancyGridMessage
              setMapGrid(msg.data, msg.info)
            }
            catch (e) {
              console.error('Failed to parse map data', data, e)
            }
          }
          break
        case 'disconnected':
          setWsState(state => ({ ...state, map: 'disconnected' }))
          mapWs.current = null
          break
        case 'error':
          setWsState(state => ({ ...state, map: 'error' }))
          mapWs.current = null
          break
      }
    })
    mapWs.current = mapClient
  }

  const setupRobotWs = () => {
    robotWs.current?.close()

    const robotClient = Websocket.connect('robot_data', (state, data) => {
      switch (state) {
        case 'connected':
          setWsState(state => ({ ...state, robot: 'connected' }))
          if (data) {
            try {
              const msg = JSON.parse(data) as RobotInfoMessage
              setRobotPose(msg.pose)
            }
            catch (e) {
              console.error('Failed to parse robot data', data, e)
            }
          }
          break
        case 'disconnected':
          setWsState(state => ({ ...state, robot: 'disconnected' }))
          robotWs.current = null
          break
        case 'error':
          setWsState(state => ({ ...state, robot: 'error' }))
          robotWs.current = null
          break
      }
    })
    robotWs.current = robotClient
  }

  const fetchData = useCallback(async () => {
    await apiServer.mapping(5)
  }, [])

  useLayoutEffect(() => {
    fetchData()
    return () => {
      mapWs.current?.close()
      robotWs.current?.close()
    }
  }, [fetchData])

  useEffect(() => {
    return () => resetGrid()
  }, [resetGrid])

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  const handleSaveClicked = async () => {
    setShowModal(true)
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
          <div className="panel-item justify-center"
          onClick={() => setupMapWs()}>
            <div className={wsState.map === 'connected'
              ? 'border-green'
              : 'border-red' + ' border-(3px solid) rd-3px self-center'}/>
          </div>
          <div className="panel-item justify-center"
            onClick={() => setupRobotWs()}>
            <div className={wsState.robot === 'connected'
              ? 'border-green'
              : 'border-red' + ' border-(3px solid) rd-3px self-center'} />
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
          onClose={() => setShowModal(false)} />
      </div>
    </div>
  )
}

export default Mapping
