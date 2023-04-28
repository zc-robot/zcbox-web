import { useState } from 'react'
import { useNavigationStore, useOperationStore, useTaskStore } from '@/store'

type display = 'point' | 'path'

const InfoDeck: React.FC = () => {
  const [currentDisplay, setCurrentDisplay] = useState<display>('point')
  const points = useNavigationStore(state => state.points)
  const selectedId = useOperationStore(state => state.selectedPointId)
  const select = useOperationStore(state => state.selectPoint)
  const updateOp = useOperationStore(state => state.updateOp)
  const appendTaskPoint = useTaskStore(state => state.appendTaskPoint)

  return (
    <div w-12rem border='r-solid 1px gray-300'>
      <div flex='~ items-center' pl h-8 border='b-solid 1px gray-300'>
        <div
          text-3 p-1 cursor-default
          className={currentDisplay === 'point'
            ? 'font-bold'
            : 'color-gray-500 hover:color-black'}
          onClick={() => setCurrentDisplay('point')}>路径点</div>
        <div
          text-3 p-1 cursor-default
          className={currentDisplay === 'path'
            ? 'font-bold'
            : 'color-gray-500 hover:color-black'}
          onClick={() => setCurrentDisplay('path')}>路径</div>
      </div>
      <div
        flex-col
        className={currentDisplay === 'point'
          ? 'flex'
          : 'hidden'}>
        {points.map((p, i) => {
          return (
            <div
              key={i}
              cursor-default h-2rem pl-2
              flex='~ items-center' hover='border-solid border-1px border-gray-300'
              className={selectedId === p.id ? 'bg-gray-300' : ''}
              onClick={() => {
                updateOp('select')
                select(p.id)
              }}
              onDoubleClick={() => {
                appendTaskPoint(p.id)
              }}>
              <div i-material-symbols-location-on-outline text-gray-500 />
              <div ml-1 text-3>{p.id}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default InfoDeck
