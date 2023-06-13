import { useState } from 'react'
import Input from '@/components/Input'
import apiServer from '@/service/apiServer'

interface PointModalProps {
  visible: boolean
  onClose: () => void
}

const MapInfoModal: React.FC<PointModalProps> = ({ visible, onClose }) => {
  const [name, setName] = useState<string>('地图一')

  const handleSubmit = async () => {
    if (name) {
      await apiServer.saveMap(name)
      onClose()
    }
  }

  return (
    <>
      {visible && <div className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-(justify-center items-center)">
        <div
          className="flex flex-col border-(solid 1px gray-300) shadow-md w-20rem min-h-16rem p-4 bg-white rounded-2xl" >
          <div className="flex items-end text-3">
            <span className="text-5 font-bold mr-3">保存地图</span>
            <div
              className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5"
              onClick={() => onClose()} />
          </div>
          <div className="flex justify-between items-center pt-2 pb-2 mt-5">
            <span className="font-bold">地图名称</span>
            <Input
              value={name}
              onChange={e => setName(e.target.value)} />
          </div>
          <div className="flex flex-row-reverse justify-between mt-a">
            <div
              className="bg-gray-300 p1 rounded-1 text-sm cursor-default"
              onClick={() => handleSubmit()}>
              确认
            </div>
          </div>
        </div>
      </div >}
    </>
  )
}

export default MapInfoModal
