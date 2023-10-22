import { useState } from 'react'
import { toNumber, toString } from 'lodash'
import { useProfileStore } from '@/store'
import type { NavPath } from '@/types'
import Input from '@/components/Input'

interface PathModalProps {
  path: NavPath
  onClose: () => void
}

const PathModal: React.FC<PathModalProps> = ({ path, onClose }) => {
  const updateCurrentProfilePath = useProfileStore(state => state.updateCurrentProfilePath)
  const removeCurrentProfilePath = useProfileStore(state => state.removeCurrentProfilePath)
  const [pathProp, setPointProp] = useState < { : string } > ({
    thickness: toString(path.thickness),
  })

  const handleDelete = () => {
    removeCurrentProfilePath(path.uid)
    onClose()
  }

  const handleSubmit = () => {
    updateCurrentProfilePath(path.uid, {
      thickness: toNumber(pathProp.thickness),
    })

    onClose()
  }
  return (
    <div className={'fixed z-100 top-0 left-0 right-0 bottom-0 flex-(justify-center items-center) flex bg-gray-100/30'}>
      <div
        className="flex flex-col border-(solid 1px gray-300) shadow-md w-20rem min-h-14rem p-4 bg-white rounded-2xl" >
        <div className="flex items-end text-3">
          <span className="text-5 font-bold mr-3">{path.uid}</span>
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5"
            onClick={() => onClose()} />
        </div>
        <div className="flex flex-justify-between items-center mt-4 pt-2 pb-2 border-(b-solid 1px gray-300)">
          <span className="font-bold">Thickness</span>
          <Input
            className="w-40"
            type="number"
            value={pathProp.thickness}
            onChange={(e) => {
              setPointProp({ thickness: e.target.value })
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

export default PathModal
