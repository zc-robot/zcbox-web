import { useState } from 'react'
import { toNumber, toString } from 'lodash'
import Input from '@/components/Input'
import { useProfileStore } from '@/store'
import type { NavPoint } from '@/types'

interface PointModalProps {
  point: NavPoint
  onClose: () => void
}

// NOTE: As the point is in the coordinate system of the robot, the y-axis is reversed
//       when update the point, the y-axis should be reverse again
const PointModal: React.FC<PointModalProps> = ({ point, onClose }) => {
  const updateCurrentProfilePoint = useProfileStore(state => state.updateCurrentProfilePoint)
  const removeCurrentProfilePoint = useProfileStore(state => state.removeCurrentProfilePoint)
  const [pointProp, setPointProp] = useState<{ x: string; y: string; rotation: string }>({
    x: toString(point.x),
    y: toString(-point.y),
    rotation: toString(point.rotation),
  })

  const handleDelete = () => {
    removeCurrentProfilePoint(point.uid)
    onClose()
  }

  const handleSubmit = () => {
    updateCurrentProfilePoint(point.uid, {
      x: toNumber(pointProp.x),
      y: toNumber(-pointProp.y),
      rotation: toNumber(pointProp.rotation),
    })

    onClose()
  }

  return (
    <div className={'fixed z-100 top-0 left-0 right-0 bottom-0 flex-(justify-center items-center) flex bg-gray-100/30'}>
      <div
        className="flex flex-col border-(solid 1px gray-300) shadow-md w-20rem min-h-14rem p-4 bg-white rounded-2xl" >
        <div className="flex items-end text-3">
          <span className="text-5 font-bold mr-3">{point.uid}</span>
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5"
            onClick={() => onClose()} />
        </div>
        <div className="flex flex-justify-between items-center mt-4 pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">X</span>
          <Input
            className="w-40"
            type="number"
            value={pointProp.x}
            onChange={(e) => {
              setPointProp({ ...pointProp, x: e.target.value })
            }} />
        </div>
        <div className="flex flex-justify-between pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">Y</span>
          <Input
            className="w-40"
            type="number"
            value={pointProp.y}
            onChange={(e) => {
              setPointProp({ ...pointProp, y: e.target.value })
            }} />
        </div>
        <div className="flex flex-justify-between pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">Rotation</span>
          <Input
            className="w-40"
            type="number"
            value={pointProp.rotation}
            onChange={(e) => {
              setPointProp({ ...pointProp, rotation: e.target.value })
            }} />
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
    </div>
  )
}

export default PointModal
