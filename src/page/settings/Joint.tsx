import { round, toNumber, toString } from 'lodash'
import Input from '@/components/Input'
import { useParamsStore } from '@/store'
import type { JointParams } from '@/types'
import { useLocales } from '@/hooks'

interface JointProps {
  params: JointParams[]
}

const Joint: React.FC<JointProps> = ({ params }) => {
  const { locale } = useLocales()
  const updateJointParams = useParamsStore(state => state.updateJointParams)

  const handleParamsChanged = (index: number, param: JointParams) => {
    updateJointParams(index, param)
  }

  const roundValue = (value: string) => round(toNumber(value), 2)

  return (
    <>
      <h3>{locale('jointOption')}</h3>
      <table>
        <thead>
          <tr className="bg:gray-300 h10">
            <th>Name</th>
            <th>Type</th>
            <th>Parent</th>
            <th>Child</th>
            <th>X</th>
            <th>Y</th>
            <th>Z</th>
            <th>Roll</th>
            <th>Pitch</th>
            <th>Yaw</th>
          </tr>
        </thead>
        <tbody>
          {params.map((param, index) => (
            <tr className="even:bg-gray-100" key={index}>
              <td className="text-center">{param.name}</td>
              <td className="text-center">{param.type}</td>
              <td className="text-center">{param.parent}</td>
              <td className="text-center">{param.child}</td>
              <td className="text-center"><Input
                className="w-10"
                type="number"
                value={toString(param.x)}
                onChange={e => handleParamsChanged(index, { ...param, x: roundValue(e.target.value) })} />
              </td>
              <td className="text-center"><Input
                className="w-10"
                type="number"
                value={toString(param.y)}
                onChange={e => handleParamsChanged(index, { ...param, y: roundValue(e.target.value) })}/>
              </td>
              <td className="text-center"><Input
                className="w-10"
                type="number"
                value={toString(param.z)}
                onChange={e => handleParamsChanged(index, { ...param, z: roundValue(e.target.value) })}/>
              </td>
              <td className="text-center"><Input
                className="w-10"
                type="number"
                value={toString(param.roll)}
                onChange={e => handleParamsChanged(index, { ...param, roll: roundValue(e.target.value) })}/>
              </td>
              <td className="text-center"><Input
                className="w-10"
                type="number"
                value={toString(param.pitch)}
                onChange={e => handleParamsChanged(index, { ...param, pitch: roundValue(e.target.value) })}/>
              </td>
              <td className="text-center"><Input
                className="w-10"
                type="number"
                value={toString(param.yaw)}
                onChange={e => handleParamsChanged(index, { ...param, yaw: roundValue(e.target.value) })}/>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default Joint
