import { useEffect } from 'react'
import FootPrint from './Footprint'
import Joint from './Joint'
import Host from './Host'
import MapSetting from './MapSetting'
import Uploader from '@/page/settings/Uploader'
import apiServer from '@/service/apiServer'
import { useParamsStore } from '@/store'

const Settings: React.FC = () => {
  const params = useParamsStore(state => state.robotParams)
  const updateRobotParams = useParamsStore(state => state.updateRobotParams)

  useEffect(() => {
    const fetchParams = async () => {
      const params = await apiServer.fetchParams()
      if (params)
        updateRobotParams(params)
    }
    fetchParams()
  }, [updateRobotParams])

  const handleSubmit = async () => {
    if (!params)
      return
    await apiServer.uploadParams(params)
  }

  return (
    <div className="flex flex-(1 col) px-20 overflow-auto pb-10">
      <Host />
      <hr className="h-1px w-full border-1 bg-gray-500" />
      <MapSetting />
      <hr className="h-1px w-full border-1 bg-gray-500" />
      {params && (
        <>
          <h3>关节参数</h3>
          <Joint params={params.urdf} />
          <h3>底盘参数</h3>
          <FootPrint params={params.robot_footprint} />
          <div
            className="bg-gray-300 p1 rounded-1 text-(sm center) cursor-default w-10"
            onClick={() => handleSubmit()}>
            保存
          </div>
          <hr className="h-1px w-full border-1 bg-gray-500" />
        </>
      )}
      <h3>固件升级</h3>
      <Uploader />
    </div>
  )
}

export default Settings
