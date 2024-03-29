import { useState } from 'react'
import { toNumber, toString } from 'lodash'
import Input from '@/components/Input'

import type { NavTask, PointAction, PointNavType, TaskPoint } from '@/types'
import { useParamsStore, useProfileStore } from '@/store'
import { useLocales } from '@/hooks'

interface TaskPointModalProps {
  index: number
  task: NavTask
  point: TaskPoint
  onClose: () => void
}

const TaskPointModal: React.FC<TaskPointModalProps> = ({ index, task, point, onClose }) => {
  const { locale } = useLocales()

  const [navType, setNavType] = useState<PointNavType>(point.type)
  const [preciseXY, setPreciseXY] = useState<string>(toString(point.precise_xy))
  const [preciseRad, setPreciseRad] = useState<string>(toString(point.precise_rad))
  const [isDest, setDest] = useState<boolean>(point.dest)
  const [isReverse, setReverse] = useState<boolean>(point.reverse)
  const [actions, setActions] = useState<PointAction[]>(point.actions)

  const removeProfileTaskPoint = useProfileStore(state => state.removeProfileTaskPoint)
  const updateProfileTaskPoint = useProfileStore(state => state.updateProfileTaskPoint)
  const pointActions = useParamsStore(state => state.pointActions)

  const handleAddAction = () => {
    if (pointActions.length === 0)
      return
    setActions([...actions, pointActions[0]])
  }

  const handleRemoveAction = (index: number) => {
    const newActions = [...actions]
    newActions.splice(index, 1)
    setActions(newActions)
  }

  const handleUpdateActionType = (index: number, value: string) => {
    const id = toNumber(value)
    const action = pointActions.find(a => a.id === id)
    if (!action)
      return

    const newActions = [...actions]
    newActions[index] = action
    setActions(newActions)
  }

  const handleSubmit = () => {
    updateProfileTaskPoint(index, {
      type: navType,
      precise_xy: preciseXY,
      precise_rad: preciseRad,
      reverse: isReverse,
      dest: isDest,
      actions,
    })

    onClose()
  }

  const handleDelete = () => {
    removeProfileTaskPoint(index)

    onClose()
  }

  return (
    <div className={'fixed z-100 top-0 left-0 right-0 bottom-0 flex-(justify-center items-center) flex bg-gray-100/30'}>
      <div
        className="flex flex-col border-(solid 1px gray-300) shadow-md w-20rem min-h-16rem p-4 bg-white rounded-2xl" >
        <div className="flex items-end text-3">
          <span className="text-5 font-bold mr-3">{point.uid}</span>
          {`${task.uid}(${index + 1})`}
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5"
            onClick={() => onClose()} />
        </div>
        <div className="flex flex-justify-between pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">是否停靠点</span>
          <select
            value={isDest ? 'true' : 'false'}
            onChange={e => setDest(e.target.value === 'true')}>
            <option value="true">{locale('confirm')}</option>
            <option value="false">{locale('cancel')}</option>
          </select>
        </div>
        <div className="flex flex-justify-between pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">导航方式</span>
          <select
            value={navType}
            onChange={e => setNavType(e.target.value as PointNavType)}>
            <option value="auto">Auto</option>
            <option value="manually">Manual</option>
          </select>
        </div>
        <div className="flex flex-justify-between pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">导航精度</span>
          <Input
            className="w-20"
            type="number"
            value={preciseXY}
            defaultValue={0.3}
            onChange={e => setPreciseXY(e.target.value)} />
          米
          <Input
            className="w-20"
            type="number"
            value={preciseRad}
            onChange={e => setPreciseRad(e.target.value)}
            defaultValue={6.28} />
          rad
        </div>

        <div className="flex flex-justify-between pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">倒车进入</span>
          <select
            value={isReverse ? 'true' : 'false'}
            onChange={e => setReverse(e.target.value === 'true')}>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </div>
        <div className="flex flex-justify-between pt-2 pb-2">
          <span className="font-bold">动作</span>
          <div className="i-material-symbols-add"
            onClick={_ => handleAddAction()} />
        </div>
        <div className="flex flex-col overflow-auto mb-5">
          {actions.map((action, i) => {
            return (
              <div key={i} className="flex flex-items-center pt-2 pb-2">
                <div className="i-material-symbols-delete-outline"
                  onClick={_ => handleRemoveAction(i)} />
                <select
                  className="ml-2"
                  value={action.id}
                  onChange={e => handleUpdateActionType(i, e.target.value)}>
                  {pointActions.map((action, i) => {
                    return (
                      <option key={i} value={action.id}>{action.name}</option>
                    )
                  })}
                </select>
              </div>
            )
          })}
        </div>
        <div className="flex flex-justify-between mt-a">
          <div className="p1 border-(solid 1px red) text='sm red' rounded-1 cursor-default"
            onClick={() => handleDelete()}>
            删除
          </div>
          <div
            className="bg-gray-300 p1 rounded-1 text-sm cursor-default"
            onClick={() => handleSubmit()}>
            确认
          </div>
        </div>
      </div>
    </div >
  )
}

export default TaskPointModal
