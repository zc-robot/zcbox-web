import { useState } from 'react'
import type { NavTask, PointNavType } from '@/types'
import { useTaskStore } from '@/store'

interface TaskPointsProp {
  task: NavTask
}

const TaskPoints: React.FC<TaskPointsProp> = ({ task }) => {
  const [dragState, setDragState] = useState({ dragIndex: -1, hoverIndex: -1 })

  const swapTaskPoints = useTaskStore(state => state.swapTaskPoints)
  const updatePointType = useTaskStore(state => state.updatePointNavType)

  return (
    <>
      {task.points.map((p, i) => {
        return (
          <div
            key={i}
            flex='~ items-center justify-between' h-2rem pl-2 pr-2 text-3
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
            <select
              value={p.type}
              onChange={e => updatePointType(task.id, i, e.target.value as PointNavType)}>
              <option value='auto'>Auto</option>
              <option value='manually'>Manual</option>
            </select>
          </div>
        )
      })}
    </>
  )
}

export default TaskPoints
