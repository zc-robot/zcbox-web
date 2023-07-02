import { toNumber } from 'lodash'
import { useParamsStore } from '@/store'

const MapSetting: React.FC = () => {
  const mapParams = useParamsStore(state => state.mapParams)

  const updateMapParams = useParamsStore(state => state.updateMapParams)

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateMapParams({ resolution: toNumber(e.target.value) })
  }

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateMapParams({ model: e.target.value })
  }

  return (
    <>
      <h3>建图配置</h3>
      <div className="flex flex-justify-between pt-2 pb-2">
        <span className="font-bold">分辨率</span>
        <select
          value={mapParams.resolution}
          onChange={handleResolutionChange}>
          <option value="2">2</option>
          <option value="5">5</option>
        </select>
      </div>
      <div className="flex flex-justify-between pt-2 pb-2">
        <span className="font-bold">模型</span>
        <select
          value={mapParams.model}
          onChange={handleModelChange}>
          <option value="diff">diff</option>
          <option value="ackermann">ackermann</option>
        </select>
      </div>
    </>
  )
}

export default MapSetting
