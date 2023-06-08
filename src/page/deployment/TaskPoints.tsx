import { useState } from 'react'
import PointModal from './PointModal'
import type { NavTask, TaskPoint } from '@/types'
import { useTaskStore } from '@/store'

interface TaskPointsProp {
  task: NavTask
}

const TaskPoints: React.FC<TaskPointsProp> = ({ task }) => {
  const [dragState, setDragState] = useState({ dragIndex: -1, hoverIndex: -1 })
  const [configPoint, setConfigPoint] = useState<{ index: number; point: TaskPoint }>()

  const swapTaskPoints = useTaskStore(state => state.swapTaskPoints)

  return (
    <div flex="~ col">
      {task.points.map((p, i) => {
        return (
          <div
            key={i}
            flex="~ items-center justify-between" h-2rem pl-2 pr-2 text-3
            onDragStart={() => {
              setDragState({ ...dragState, dragIndex: i })
            }}
            onDragEnter={() => {
              setDragState({ ...dragState, hoverIndex: i })
            }}
            onDragEnd={() => {
              if (dragState.dragIndex !== dragState.hoverIndex) {
                swapTaskPoints(task.id, dragState.dragIndex, dragState.hoverIndex)
                setDragState({ dragIndex: -1, hoverIndex: -1 })
              }
              setDragState({ dragIndex: -1, hoverIndex: -1 })
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            draggable
          >{p.id}
            <div i-material-symbols-edit-outline m-2 onClick={() => setConfigPoint({ index: i, point: p })} />
          </div>
        )
      })}
      <PointModal
        task={task}
        index={configPoint?.index ?? 0}
        point={configPoint?.point}
        onClose={() => setConfigPoint(undefined)} />
    </div>
  )
}

export default TaskPoints
