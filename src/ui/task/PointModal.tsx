import { useEffect, useState } from 'react'
import type { NavTask, PointNavType, TaskPoint } from '@/types'
import { useTaskStore } from '@/store'

interface PointModalProps {
  index: number
  task: NavTask
  point: TaskPoint | undefined
  onClose: () => void
}

const PointModal: React.FC<PointModalProps> = ({ index, task, point, onClose }) => {
  const [navType, setNavType] = useState<PointNavType>('auto')
  const [actions, setActions] = useState<{ type: string; args: number }[]>([])
  const updateTask = useTaskStore(state => state.updateTask)

  useEffect(() => {
    setNavType(point?.type ?? 'auto')
    setActions(point?.actions ?? [])
  }, [point])

  const handleAddAction = () => {
    setActions([...actions, { type: 'wait', args: 1 }])
  }

  const handleRemoveAction = (index: number) => {
    const newActions = [...actions]
    newActions.splice(index, 1)
    setActions(newActions)
  }

  const handleUpdateActionType = (index: number, type: string) => {
    const newActions = [...actions]
    newActions[index].type = type
    setActions(newActions)
  }

  const handleUpdateActionArgs = (index: number, args: number) => {
    const newActions = [...actions]
    newActions[index].args = args
    setActions(newActions)
  }

  const handleSubmit = () => {
    updateTask(task.id, index, navType, actions)

    onClose()
  }

  return (
    <>
      {point && (
        <div fixed z-100 top-0 left-0 right-0 bottom-0
          flex='justify-center items-center'
          className={point ? 'flex bg-gray-100/30' : 'hidden'}>
          <div flex='~ col' border='solid 1px gray-300'
            shadow-md w-20rem h-16rem p-4 bg-white rounded-2xl>
            <div flex='~ items-end' text-3>
              <span text-5 font-bold mr-3>{point.id}</span>
              {`${task.id}(${index + 1})`}
              <div
                i-material-symbols-cancel-outline-rounded
                flex-self-center ml-a text-5
                onClick={() => onClose()} />
            </div>
            <div flex='~ justify-between' mt-5 pt-2 pb-2 border='b-solid 1px gray-300'>
              <span font-bold>导航方式</span>
              <select
                value={navType}
                onChange={e => setNavType(e.target.value as PointNavType)}>
                <option value='auto'>Auto</option>
                <option value='manually'>Manual</option>
              </select>
            </div>
            <div flex='~ justify-between' pt-2 pb-2>
              <span font-bold>动作</span>
              <div i-material-symbols-add
                onClick={_ => handleAddAction()} />
            </div>
            <div flex='~ col' overflow-auto mb-5>
              {actions.map((action, i) => {
                return (
                  <div key={i} flex='~ items-center' pt-2 pb-2>
                    <div i-material-symbols-delete-outline
                      onClick={_ => handleRemoveAction(i)}
                    />
                    <select
                      ml-2
                      value={action.type}
                      onChange={e => handleUpdateActionType(i, e.target.value)}>
                      <option value='wait'>等待</option>
                      <option value='arm'>叉臂</option>
                    </select>
                    <input ml-a
                      type='number'
                      value={action.args}
                      onChange={e => handleUpdateActionArgs(i, Number(e.target.value))}
                    />
                  </div>
                )
              })}
            </div>
            <div
              flex-self-end mt-a bg-gray-300 p-1 rounded-1 text-sm cursor-default
              onClick={() => handleSubmit()}>
              确认
            </div>
          </div>
        </div >
      )}
    </>
  )
}

export default PointModal