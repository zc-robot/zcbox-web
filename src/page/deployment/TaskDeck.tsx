import { useState } from 'react'
import TaskPoints from './TaskPoints'
import { useGridStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'

const TaskDeck: React.FC = () => {
  const [showTaskList, setShowTaskList] = useState(false)
  const [repeat, setRepeat] = useState(false)

  const robotStatus = useGridStore(state => state.robotInfo?.status)
  const executingTaskId = useGridStore(state => state.robotInfo?.task_uid)
  const currentProfileId = useProfileStore(state => state.currentProfileId)
  const currentTaskId = useProfileStore(state => state.currentTaskId)
  const setCurrentTask = useProfileStore(state => state.setCurrentTask)
  const currentTasks = useProfileStore(state => state.currentProfileTasks())
  const currentEnabledTask = useProfileStore(state => state.getCurrentTask())
  const addTask = useProfileStore(state => state.appendProfileTask)

  const toggleTask = async () => {
    if (!currentProfileId || !currentTaskId)
      return
    if (robotStatus !== 'idle')
      await apiServer.stopTask()

    else
      await apiServer.executeTask(currentTaskId, repeat)
  }

  const toggleRepeat = () => {
    setRepeat(!repeat)
  }

  return (
    <div className="flex-(grow shrink-0 basis-a) h-0 overflow-auto">
      <div className="flex flex-(justify-between items-center) pl h-8 border-(b-solid 1px gray-300)">
        <div
          className={`color-gray-500 ${robotStatus === 'idle' ? 'i-material-symbols-play-arrow-outline' : 'i-material-symbols-pause-outline'}`}
          onClick={toggleTask} />
        <input type="checkbox" className="text-sm mr-a" title="多次运行" checked={repeat} onChange={toggleRepeat}/>
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
          const executing = executingTaskId === t.uid
          return (
            <div
              key={i}
              className={`flex flex-items-center pl text-3 cursor-default h-2rem ${enabled && 'font-bold'} ${executing && 'text-green'}`}
              onClick={() => setCurrentTask(t.uid)}>
              <div
                className={`i-material-symbols-check-small mr-1 ${enabled ? '' : 'invisible'}`} />
              {t.name}
            </div>
          )
        })}
      </div>
      {currentEnabledTask && <TaskPoints task={currentEnabledTask} />}
    </div>
  )
}

export default TaskDeck
