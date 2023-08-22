import { toNumber } from 'lodash'
import { useParamsStore } from '@/store'
import { useLocales } from '@/hooks'

const MapSetting: React.FC = () => {
  const { locale } = useLocales()
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
      <h3>{locale('mapOption')}</h3>
      <div className="flex flex-justify-between pt-2 pb-2">
        <span className="font-bold">{locale('resolution')}</span>
        <select
          value={mapParams.resolution}
          onChange={handleResolutionChange}>
          <option value="5">5</option>
          <option value="2">2</option>
        </select>
      </div>
      <div className="flex flex-justify-between pt-2 pb-2">
        <span className="font-bold">{locale('model')}</span>
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
