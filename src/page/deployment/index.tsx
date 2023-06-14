import { useParams } from 'react-router-dom'
import { useCallback, useLayoutEffect, useRef } from 'react'
import ControllerDeck from './ControllerDeck'
import ProfileDeck from './ProfileDeck'
import TaskDeck from './TaskDeck'
import TopDeck from '@/page/deployment/TopDeck'
import Monitor from '@/components/map/Monitor'
import { useGridStore, useProfileStore } from '@/store'
import Websocket from '@/service/websocket'
import type { RobotInfoMessage } from '@/types'
import apiServer from '@/service/apiServer'

const Deployment: React.FC = () => {
  const { mapId } = useParams()
  const robotWs = useRef<Websocket | null>(null)
  const setMapGrid = useGridStore(state => state.setMapGrid)
  const setRobotPose = useGridStore(state => state.setRobotPose)
  const resetGrid = useGridStore(state => state.resetGrid)
  const resetProfile = useProfileStore(state => state.resetProfile)
  const addProfiles = useProfileStore(state => state.addProfiles)

  const parseMapId = useCallback(() => {
    if (!mapId)
      return 0
    return Number.parseInt(mapId)
  }, [mapId])

  const initWebsocket = useCallback(() => {
    if (!robotWs.current) {
      const client = Websocket.connect('robot_data', (state, data) => {
        if (state === 'connected') {
          const msg = JSON.parse(data) as RobotInfoMessage
          setRobotPose(msg.pose)
        }
      })
      robotWs.current = client
    }
  }, [setRobotPose])

  const fetchData = useCallback(async () => {
    await apiServer.navigation(parseMapId())
    const data = await apiServer.fetchMap(parseMapId())
    const mapData = data.data
    const profiles = data.deployment
    setMapGrid(mapData.data, mapData.info)
    addProfiles(profiles)
  }, [addProfiles, parseMapId, setMapGrid])

  useLayoutEffect(() => {
    initWebsocket()
    fetchData()
    return () => {
      robotWs.current?.close()
      resetGrid()
      resetProfile()
    }
  }, [fetchData, initWebsocket, resetGrid, resetProfile])

  return (
    <div className="flex flex-(col 1) h-full">
      <TopDeck mapId={parseMapId()} />
      <div className="flex flex-auto">
      <ProfileDeck mapId={parseMapId()} />
        <Monitor />
        <div className="flex flex-col w-12rem border-(l-solid 1px gray-300)">
          <TaskDeck />
          <ControllerDeck />
        </div>
      </div>
    </div>
  )
}

export default Deployment
