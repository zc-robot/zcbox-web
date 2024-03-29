import Switcher from '@/components/Switcher'
import Input from '@/components/Input'
import type { FootprintParams } from '@/types'
import { useParamsStore } from '@/store'
import { useLocales } from '@/hooks'

interface FootprintProps {
  params: FootprintParams
}

const FootPrint: React.FC<FootprintProps> = ({ params }) => {
  const { locale } = useLocales()
  const updateFootprintParams = useParamsStore(state => state.updateFootprintParams)

  return (
    <>
      <h3>{locale('footprintOption')}</h3>
      <form >
        <div className="flex flex-items-center p2 gap-2">
          <span className="text-sm w-30">{locale('circleFootprint')}</span>
          <Switcher
            isChecked={params.is_round}
            setChecked={() => updateFootprintParams({ ...params, is_round: !params.is_round })} />
        </div>
        {params.is_round
          ? (
            <div className="flex flex-items-center p2 gap-2">
              <span className="text-sm w-30">{locale('footprintRadius')}</span>
              <Input
                className="w-50"
                type="number"
                value={params.radius}
                onChange={e => updateFootprintParams({ ...params, radius: Number(e.target.value) })}
                placeholder="请输入底盘半径" />
            </div>
            )
          : (
            <>
              <div className="flex flex-items-center p2 gap-2">
                <span className="text-sm w-30">底盘宽度</span>
                <Input
                  className="w-50"
                  type="number"
                  value={params.robot_width}
                  onChange={e => updateFootprintParams({ ...params, robot_width: Number(e.target.value) })}
                  placeholder="请输入底盘宽度" />
              </div>
              <div className="flex flex-items-center p2 gap-2">
                <span className="text-sm w-30">底盘长度</span>
                <Input
                  className="w-50"
                  type="number"
                  value={params.robot_length}
                  onChange={e => updateFootprintParams({ ...params, robot_length: Number(e.target.value) })}
                  placeholder="请输入底盘长度" />
              </div>
              <div className="flex flex-items-center p2 gap-2">
                <span className="text-sm w-30">底盘-导航距离</span>
                <Input
                  className="w-50"
                  type="number"
                  value={params.nav_center2robot_center}
                  onChange={e => updateFootprintParams({ ...params, nav_center2robot_center: Number(e.target.value) })}
                  placeholder="请输入导航中心-底盘中心距离" />
              </div>
            </>
            )}
      </form>
    </>
  )
}

export default FootPrint
