import { useParams } from 'react-router-dom'
import ControllerDeck from './ControllerDeck'
import InfoDeck from './InfoDeck'
import TaskDeck from './TaskDeck'
import TopDeck from '@/page/deployment/TopDeck'
import Monitor from '@/components/map/Monitor'

const Deployment: React.FC = () => {
  const { mapId } = useParams()

  return (
    <div flex="~ col 1" h-full>
      <TopDeck />
      <div flex="~ auto">
        {mapId && <InfoDeck />}
        <Monitor />
        {mapId && <div flex="~ col" w-12rem border="l-solid 1px gray-300">
          <TaskDeck />
          <ControllerDeck />
        </div>}
      </div>
    </div>
  )
}

export default Deployment