import { useState } from 'react'
import TaskPointModal from './TaskPointModal'
import type { NavTask, TaskPoint } from '@/types'
import { useProfileStore } from '@/store'

interface TaskPointsProp {
  task: NavTask
}

const TaskPoints: React.FC<TaskPointsProp> = ({ task }) => {
  const [dragState, setDragState] = useState({ dragIndex: -1, hoverIndex: -1 })
  const [configPoint, setConfigPoint] = useState<{ index: number; point: TaskPoint }>()

  const swapProfileTaskPoints = useProfileStore(state => state.swapProfileTaskPoints)
  const currentProfilePoints = useProfileStore(state => state.currentProfilePoints)

  return (
    <div className="flex flex-col">
      {task.points.map((p, i) => {
        const waypoint = currentProfilePoints().find(wp => wp.uid === p.uid)
        if (!waypoint)
          return null

        return (
          <div
            key={i}
            className="flex flex-(items-center justify-between) h-2rem pl-2 pr-2 text-3"
            onDragStart={() => {
              setDragState({ ...dragState, dragIndex: i })
            }}
            onDragEnter={() => {
              setDragState({ ...dragState, hoverIndex: i })
            }}
            onDragEnd={() => {
              if (dragState.dragIndex !== dragState.hoverIndex) {
                swapProfileTaskPoints(dragState.dragIndex, dragState.hoverIndex)
                setDragState({ dragIndex: -1, hoverIndex: -1 })
              }
              setDragState({ dragIndex: -1, hoverIndex: -1 })
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            draggable
          >{waypoint.name}
            <div
             className="i-material-symbols-edit-outline m-2"
             onClick={() => setConfigPoint({ index: i, point: p })} />
          </div>
        )
      })}
      {configPoint && <TaskPointModal
        task={task}
        index={configPoint.index}
        point={configPoint.point}
        onClose={() => setConfigPoint(undefined)} />}
    </div>
  )
}

export default TaskPoints
