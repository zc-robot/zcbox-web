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

  const currentTask = () => {
    if (!currentTaskId)
      return undefined
    return task(currentTaskId)
  }

  return (
    <div w-12rem border='l-solid 1px gray-300'>
      <div flex='~ row-reverse items-center' pl h-8 border='b-solid 1px gray-300'>
        <div flex='~ items-center' text-3 p-1 cursor-default color-gray-500
          onClick={() => setShowTaskList(!showTaskList)}>
          {currentTaskId ?? '任务列表'}<div i-material-symbols-keyboard-arrow-down />
        </div>
      </div>
      <div border='b-solid 1px gray-300'
        className={showTaskList ? 'flbex w-100%' : 'hidden'}>
        <div flex='~ justify-between items-center' pl pr h-8>
          <div text-3 p-1 cursor-default font-bold>任务</div>
          <div i-material-symbols-add
            onClick={() => addTask()} />
        </div>
        {tasks.map((t, i) => {
          const enabled = currentTaskId === t.id
          return (
            <div
              key={i}
              flex='~ items-center' pl text-3 cursor-default h-2rem
              className={enabled ? 'font-bold' : ''}
              onClick={() => enableTask(t.id)}>
              <div i-material-symbols-check-small mr-1
                className={enabled ? '' : 'invisible'} />
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
