import { useParams } from 'react-router-dom'
import { useCallback, useEffect } from 'react'
import { toNumber } from 'lodash'
import toast from 'react-hot-toast'
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
  const { addProfiles, resetProfile } = useProfileStore(state => ({
    addProfiles: state.addProfiles,
    resetProfile: state.resetProfile,
  }))

  const parseMapId = useCallback(() => {
    if (!mapId)
      return 0
    return toNumber(mapId)
  }, [mapId])

  useEffect(() => {
    const loadProfiles = async () => {
      const currentMapId = parseMapId()
      if (!currentMapId)
        return

      try {
        const profiles = await apiServer.fetchMapDeployment(currentMapId)
        addProfiles(profiles)
      }
      catch (error) {
        console.error('加载部署配置失败:', error)
        toast.error('加载部署配置失败')
      }
    }

    loadProfiles()
    return () => {
      resetGrid()
      resetProfile()
    }
  }, [addProfiles, parseMapId, resetGrid, resetProfile])

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
