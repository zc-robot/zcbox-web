import { useEffect, useState } from 'react'
import TaskPoints from './TaskPoints'
import { useGridStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'
import EditableLabel from '@/components/EditableLabel'
import type { NavTask } from '@/types'

interface TaskItemProps {
  task: NavTask
  enabled: boolean
  executing: boolean
  onTaskSelected: (task: NavTask) => void
  onTaskRenamed: (name: string) => void
  onDeleteClicked: () => void
}

const TaskItem: React.FC<TaskItemProps> = ({ task, enabled, executing, onTaskSelected, onTaskRenamed, onDeleteClicked }) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(task.name)

  useEffect(() => {
    setName(task.name)
  }, [task])

  return (
    <div
      className={`flex flex-items-center pl text-3 cursor-default h-2rem ${enabled && 'font-bold'} ${executing && 'text-green'}`}
      onClick={(e) => {
        e.preventDefault()
        onTaskSelected(task)
        if (showMenu)
          setShowMenu(false)
      }}
      onContextMenu={(e) => {
        e.preventDefault()

        if (enabled)
          setShowMenu(true)
      }}>
      <div
        className={`i-material-symbols-check-small mr-1 ${enabled ? '' : 'invisible'}`} />
      <EditableLabel value={name} onValueChanged={setName} onValueConfirmed={onTaskRenamed} />
      {showMenu && <div className="z-10 relative left-5 top-5 bg-white shadow-(sm blueGray)">
        <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onDeleteClicked}>删除</div>
      </div>}
    </div>
  )
}

const TaskDeck: React.FC = () => {
  const [showTaskList, setShowTaskList] = useState(false)
  const [repeat, setRepeat] = useState(false)

  const { robotStatus, executingTaskId } = useGridStore(state => ({
    robotStatus: state.robotInfo?.fsm,
    executingTaskId: state.robotInfo?.task_uid,
  }))
  const {
    currentProfileId, currentTaskId, setCurrentTask, currentTasks,
    currentEnabledTask, addTask, updateCurrentTask, removeProfileTask,
  } = useProfileStore(state => ({
    currentProfileId: state.currentProfileId,
    currentTaskId: state.currentTaskId,
    setCurrentTask: state.setCurrentTask,
    currentTasks: state.currentProfileTasks(),
    currentEnabledTask: state.getCurrentTask(),
    addTask: state.appendProfileTask,
    updateCurrentTask: state.updateCurrentTask,
    removeProfileTask: state.removeProfileTask,
  }))

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
            <TaskItem
              key={i}
              enabled={enabled}
              executing={executing}
              task={t}
              onTaskSelected={() => setCurrentTask(t.uid)}
              onTaskRenamed={name => updateCurrentTask({ name })}
              onDeleteClicked={() => removeProfileTask(t.uid)}
              />
          )
        })}
      </div>
      {currentEnabledTask && <TaskPoints task={currentEnabledTask} />}
    </div>
  )
}

export default TaskDeck
