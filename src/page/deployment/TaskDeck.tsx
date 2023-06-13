import { useState } from 'react'
import TaskPoints from './TaskPoints'
import { useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'

const TaskDeck: React.FC = () => {
  const [showTaskList, setShowTaskList] = useState(false)

  const currentProfileId = useProfileStore(state => state.currentProfileId)
  const currentTaskId = useProfileStore(state => state.currentTaskId)
  const setCurrentTask = useProfileStore(state => state.setCurrentTask)
  const currentTasks = useProfileStore(state => state.currentProfileTasks())
  const currentEnabledTask = useProfileStore(state => state.getCurrentTask())
  const addTask = useProfileStore(state => state.appendProfileTask)

  const [executingTaskId, setExecutingTaskId] = useState<string | undefined>(undefined)

  const toggleTask = async () => {
    if (!currentProfileId || !currentTaskId)
      return
    if (executingTaskId) {
      await apiServer.stopTask()
      setExecutingTaskId(undefined)
    }
    else {
      await apiServer.executeTask(currentTaskId)
      setExecutingTaskId(currentTaskId)
    }
  }

  return (
    <div className="flex-(grow shrink-0 basis-a) h-0 overflow-auto">
      <div className="flex flex-(justify-between items-center) pl h-8 border-(b-solid 1px gray-300)">
        <div
          className={`color-gray-500 ${executingTaskId ? 'i-material-symbols-pause-outline' : 'i-material-symbols-play-arrow-outline'}`}
          onClick={toggleTask} />
        <div className="flex flex-items-center text-3 p-1 cursor-default color-gray-500"
          onClick={() => setShowTaskList(!showTaskList)}>
          {currentTaskId ?? '任务列表'}<div className="i-material-symbols-keyboard-arrow-down" />
        </div>
      </div>
      <div className={showTaskList ? 'flex flex-col w-full' : 'hidden'}>
        <div className="flex justify-between items-center pl pr h-8>">
          <div className="text-3 p-1 cursor-default font-bold">任务</div>
          <div className="i-material-symbols-add"
            onClick={() => addTask()} />
        </div>
        {currentTasks.map((t, i) => {
          const enabled = currentTaskId === t.uid
          return (
            <div
              key={i}
              className={`flex flex-items-center pl text-3 cursor-default h-2rem ${enabled ? 'font-bold' : ''}`}
              onClick={() => setCurrentTask(t.uid)}>
              <div
                className={`i-material-symbols-check-small mr-1 ${enabled ? '' : 'invisible'}`} />
              {t.uid}
            </div>
          )
        })}
      </div>
      {currentEnabledTask && <TaskPoints task={currentEnabledTask} />}
    </div>
  )
}

export default TaskDeck
