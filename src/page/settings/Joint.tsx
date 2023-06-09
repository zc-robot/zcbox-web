import Input from '@/components/Input'
import { useParamsStore } from '@/store'
import type { JointParams } from '@/types'

interface JointProps {
  params: JointParams[]
}

const Joint: React.FC<JointProps> = ({ params }) => {
  const updateJointParams = useParamsStore(state => state.updateJointParams)

  const handleParamsChanged = (index: number, param: JointParams) => {
    updateJointParams(index, param)
  }

  return (
    <table>
      <thead>
        <tr bg:gray-300 h10>
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
          <tr even:bg-gray-100 key={index}>
            <td text-center>{param.name}</td>
            <td text-center>{param.type}</td>
            <td text-center>{param.parent}</td>
            <td text-center>{param.child}</td>
            <td text-center><Input w-10 value={param.x} onChange={e => handleParamsChanged(index, { ...param, x: Number.parseFloat(e.target.value) })} /></td>
            <td text-center><Input w-10 value={param.y} onChange={e => handleParamsChanged(index, { ...param, y: Number.parseFloat(e.target.value) })}/></td>
            <td text-center><Input w-10 value={param.z} onChange={e => handleParamsChanged(index, { ...param, z: Number.parseFloat(e.target.value) })}/></td>
            <td text-center><Input w-10 value={param.roll} onChange={e => handleParamsChanged(index, { ...param, roll: Number.parseFloat(e.target.value) })}/></td>
            <td text-center><Input w-10 value={param.pitch} onChange={e => handleParamsChanged(index, { ...param, pitch: Number.parseFloat(e.target.value) })}/></td>
            <td text-center><Input w-10 value={param.yaw} onChange={e => handleParamsChanged(index, { ...param, yaw: Number.parseFloat(e.target.value) })}/></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default Joint
