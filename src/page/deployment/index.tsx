import { useParams } from 'react-router-dom'
import { useCallback, useEffect } from 'react'
import { toNumber } from 'lodash'
import ProfileDeck from './ProfileDeck'
import TaskDeck from './TaskDeck'
import ControllerDeck from '@/components/ControllerDeck'
import TopDeck from '@/page/deployment/TopDeck'
import Monitor from '@/components/map/Monitor'
import { useGridStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'

const Deployment: React.FC = () => {
  const { mapId } = useParams()
  const resetGrid = useGridStore(state => state.resetGrid)
  const resetProfile = useProfileStore(state => state.resetProfile)

  const parseMapId = useCallback(() => {
    if (!mapId)
      return 0
    return toNumber(mapId)
  }, [mapId])

  useEffect(() => {
    const startNavigation = async () => {
      await apiServer.navigation(parseMapId())
    }

    startNavigation()
    return () => {
      resetGrid()
      resetProfile()
    }
  }, [parseMapId, resetGrid, resetProfile])

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
