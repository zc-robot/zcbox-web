import { useEffect, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useOperationStore, useProfileStore } from '@/store'
import type { NavPoint } from '@/types'
import apiServer from '@/service/apiServer'

type display = 'point' | 'path'

interface PointItemProps {
  point: NavPoint
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  onDoubleClick: () => void
  onDeleteClick: () => void
  onRelocateClick: () => void
}

const PointItem: React.FC<PointItemProps> = ({ point, selected, onClick, onDoubleClick, onDeleteClick, onRelocateClick }) => {
  const [showMenu, setShowMenu] = useState(false)
  useEffect(() => {
    if (!selected)
      setShowMenu(false)
  }, [selected])

  return (
    <div
      className={`cursor-default h-2rem pl-2 flex items-center hover:(outline outline-1 outline-blue-300) ${selected
        ? 'bg-gray-300'
        : ''}`}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
        if (showMenu)
          setShowMenu(false)
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault()

        if (selected)
          setShowMenu(true)
      }}>
      <div className="i-material-symbols-location-on-outline text-gray-500" />
      <div className="ml-1 text-3">{point.name}</div>
      {showMenu
      && <div className="z-10 relative left-5 top-5 bg-white shadow-(sm blueGray)">
          <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onDeleteClick}>删除</div>
          <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onRelocateClick}>重定位机器人</div>
        </div>}
    </div>
  )
}

export interface ProfileDeckProps {
  mapId: number
}

const ProfileDeck: React.FC<ProfileDeckProps> = ({ mapId }) => {
  const [showProfileList, setShowProfileList] = useState(true)
  const [currentDisplay, setCurrentDisplay] = useState<display>('point')

  const { selectedId, select, updateOp } = useOperationStore(state => ({
    selectedId: state.selectedPointId,
    select: state.selectPoint,
    updateOp: state.updateOp,
  }), shallow)
  const {
    profiles, currentProfileId, currentPoints, currentPaths,
    addProfile, appendTaskPoint, removeCurrentProfilePoint, setCurrentProfile,
  } = useProfileStore(state => ({
    profiles: state.filterMapProfiles(mapId),
    currentProfileId: state.currentProfileId,
    currentPoints: state.currentProfilePoints(),
    currentPaths: state.currentProfilePaths(),
    addProfile: state.appendProfile,
    appendTaskPoint: state.appendProfileTaskPoint,
    removeCurrentProfilePoint: state.removeCurrentProfilePoint,
    setCurrentProfile: state.setCurrentProfile,
  }))

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
        className={'flex-col flex'}
        onClick={() => select(null)}>
        {currentDisplay === 'point'
          ? currentPoints.map((p, i) => <PointItem
            key={i}
            point={p}
            selected={selectedId === p.uid}
            onClick={(e) => {
              e.stopPropagation()
              updateOp('select')
              select(p.uid)
            }}
            onDoubleClick={() => {
              appendTaskPoint(p)
            }}
            onDeleteClick={() => {
              removeCurrentProfilePoint(p.uid)
            }}
            onRelocateClick={async () => {
              if (currentProfileId)
                await apiServer.relocate(currentProfileId, p.uid)
            }} />)
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
