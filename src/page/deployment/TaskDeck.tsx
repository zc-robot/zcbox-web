import { useState } from 'react'
import TaskPoints from './TaskPoints'
import { useTaskStore } from '@/store'

const TaskDeck: React.FC = () => {
  const [showTaskList, setShowTaskList] = useState(false)

  const currentTaskId = useTaskStore(state => state.enabledTaskId)
  const task = useTaskStore(state => state.task)
  const enableTask = useTaskStore(state => state.enableTask)
  const tasks = useTaskStore(state => state.tasks)
  const addTask = useTaskStore(state => state.addTask)
  const executingTaskId = useTaskStore(state => state.executingTaskId)
  const executeTask = useTaskStore(state => state.executeTask)
  const stopTask = useTaskStore(state => state.stopTask)

  const currentTask = () => {
    if (!currentTaskId)
      return undefined
    return task(currentTaskId)
  }

  const toggleTask = () => {
    if (!currentTaskId)
      return
    if (executingTaskId)
      stopTask()
    else
      executeTask(currentTaskId)
  }

  return (
    <div className="flex='grow shrink-0 basis-a' h-0 overflow-auto">
      <div className="flex flex-(justify-between items-center) pl h-8 border-(b-solid 1px gray-300)">
        <div
          className={`color-gray-500 ${executingTaskId ? 'i-material-symbols-pause-outline' : 'i-material-symbols-play-arrow-outline'}`}
          onClick={toggleTask} />
        <div className="flex flex-items-center text-3 p-1 cursor-default color-gray-500"
          onClick={() => setShowTaskList(!showTaskList)}>
          {currentTaskId ?? '任务列表'}<div className="i-material-symbols-keyboard-arrow-down" />
        </div>
      </div>
      <div className={showTaskList ? 'flbex w-100%' : 'hidden'}>
        <div className="flex flex-(justify-between items-center) pl pr h-8>">
          <div className="text-3 p-1 cursor-default font-bold">任务</div>
          <div className="i-material-symbols-add"
            onClick={() => addTask()} />
        </div>
        {tasks.map((t, i) => {
          const enabled = currentTaskId === t.id
          return (
            <div
              key={i}
              className={`flex flex-items-center pl text-3 cursor-default h-2rem ${enabled ? 'font-bold' : ''}`}
              onClick={() => enableTask(t.id)}>
              <div
                className={`i-material-symbols-check-small mr-1 ${enabled ? '' : 'invisible'}`} />
              {t.id}
            </div>
          )
        })}
      </div>
      {currentTask() && <TaskPoints task={currentTask()!} />}
    </div>
  )
}

export default TaskDeck
