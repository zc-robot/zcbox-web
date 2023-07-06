import { useState } from 'react'
import { useOperationStore, useProfileStore } from '@/store'

type display = 'point' | 'path'

export interface ProfileDeckProps {
  mapId: number
}

const ProfileDeck: React.FC<ProfileDeckProps> = ({ mapId }) => {
  const [showProfileList, setShowProfileList] = useState(true)
  const [currentDisplay, setCurrentDisplay] = useState<display>('point')
  const selectedId = useOperationStore(state => state.selectedPointId)
  const select = useOperationStore(state => state.selectPoint)
  const updateOp = useOperationStore(state => state.updateOp)

  const profiles = useProfileStore(state => state.filterMapProfiles(mapId))
  const currentProfileId = useProfileStore(state => state.currentProfileId)
  const currentPoints = useProfileStore(state => state.currentProfilePoints())
  const currentPaths = useProfileStore(state => state.currentProfilePaths())
  const addProfile = useProfileStore(state => state.appendProfile)
  const appendTaskPoint = useProfileStore(state => state.appendProfileTaskPoint)
  const setCurrentProfile = useProfileStore(state => state.setCurrentProfile)

  return (
    <div className="w-12rem border-(r-solid 1px gray-300)">
      <div className="flex h-8 border-(b-solid 1px gray-300)">
        <div className="flex flex-items-center text-3 p-2 cursor-default color-gray-500"
          onClick={() => setShowProfileList(!showProfileList)}>
          <div className="i-material-symbols-keyboard-arrow-down" />配置列表
        </div>
      </div>
      <div className={showProfileList ? 'flex flex-col' : 'hidden'}>
        <div className="flex justify-between items-center pl pr h-8>">
          <div className="text-3 p-1 cursor-default font-bold">配置</div>
          <div className="i-material-symbols-add"
            onClick={() => addProfile(mapId)} />
        </div>
        {profiles.map((p, i) => {
          const enabled = currentProfileId === p.uid
          return (<div
              key={i}
              className={`flex flex-items-center pl text-3 cursor-default h-2rem ${enabled ? 'font-bold' : ''}`}
              onClick={() => setCurrentProfile(p.uid)}>
              <div
                className={`i-material-symbols-check-small mr-1 ${enabled ? '' : 'invisible'}`} />
              {p.name}
            </div>)
        })}
      </div>
      <div className="flex items-center pl h-8 border-(b-solid 1px gray-300)">
        <div
          className={`text-3 p-1 cursor-default ${currentDisplay === 'point'
          ? 'font-bold'
          : 'color-gray-500 hover:color-black'}`}
          onClick={() => setCurrentDisplay('point')}>路径点</div>
        <div
          className={`text-3 p-1 cursor-default ${currentDisplay === 'path'
          ? 'font-bold'
          : 'color-gray-500 hover:color-black'}`}
          onClick={() => setCurrentDisplay('path')}>路径</div>
      </div>
      <div
        className={'flex-col flex'}>
        {currentDisplay === 'point'
          ? currentPoints.map((p, i) => <div
              key={i}
              className={`cursor-default h-2rem pl-2 flex items-center hover:(outline outline-1 outline-blue-300) ${selectedId === p.uid
                ? 'bg-gray-300'
                : ''}`}
              onClick={() => {
                updateOp('select')
                select(p.uid)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
              }}
              onDoubleClick={() => {
                appendTaskPoint(p)
              }}>
              <div className="i-material-symbols-location-on-outline text-gray-500" />
              <div className="ml-1 text-3">{p.name}</div>
            </div>)
          : currentPaths.map((p, i) => <div
            key={i}
            className={`cursor-default h-2rem pl-2 flex items-center hover:(outline outline-1 outline-blue-300) ${selectedId === p.uid
              ? 'bg-gray-300'
              : ''}`}
            onClick={() => {
              updateOp('select')
              select(p.uid)
            }}>
            <div className="i-material-symbols-location-on-outline text-gray-500" />
            <div className="ml-1 text-3">{p.name}</div>
            </div>)}
      </div>
    </div>
  )
}

export default ProfileDeck
