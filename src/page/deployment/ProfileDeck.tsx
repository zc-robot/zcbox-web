import type { MouseEvent } from 'react'
import { useEffect, useState } from 'react'
import { shallow } from 'zustand/shallow'
import toast from 'react-hot-toast'
import PointModal from './PointModal'
import PathModal from './PathModal'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
import type { NavPath, NavPoint, NavProfile } from '@/types'
import apiServer from '@/service/apiServer'
import EditableLabel from '@/components/EditableLabel'
import { uid } from '@/util'
import { quaternionToCanvasAngle } from '@/util/transform'

type display = 'point' | 'path'

interface ProfileItemProps {
  profile: NavProfile
  enabled: boolean
  onProfileSelected: (task: NavProfile) => void
  onProfileRenamed: (name: string) => void
  onDeleteClicked: () => void
}

const ProfileItem: React.FC<ProfileItemProps> = ({ profile, enabled, onProfileSelected, onProfileRenamed, onDeleteClicked }) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(profile.name)

  useEffect(() => {
    setName(profile.name)
  }, [profile])

  useEffect(() => {
    if (!enabled)
      setShowMenu(false)
  }, [enabled])

  return (
    <div
      className={`flex flex-items-center pl text-3 cursor-default h-2rem ${enabled ? 'font-bold' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        onProfileSelected(profile)
        if (showMenu)
          setShowMenu(false)
      }}
      onContextMenu={(e) => {
        e.preventDefault()

        if (enabled)
          setShowMenu(true)
      }}>
      <div
        className={`i-material-symbols-check-small mr-1 ${enabled ? '' : 'invisible'}`} />
      <EditableLabel value={name} onValueChanged={setName} onValueConfirmed={onProfileRenamed} />
      {showMenu && <div className="z-10 relative left-5 top-5 bg-white shadow-(sm blueGray)">
        <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onDeleteClicked}>删除</div>
      </div>}
    </div>
  )
}

interface PointItemProps {
  point: NavPoint
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  onDoubleClicked: () => void
  onEditClicked: () => void
  onDeleteClicked: () => void
  onRelocateClicked: () => void
  onPointRenamed: (name: string) => void
}

const PointItem: React.FC<PointItemProps> = ({
  point, selected, onClick, onDoubleClicked, onDeleteClicked, onEditClicked, onRelocateClicked, onPointRenamed,
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(point.name)

  useEffect(() => {
    if (!selected)
      setShowMenu(false)
  }, [selected])

  return (
    <div
      className={`cursor-default h-2rem pl-2 shrink-0 flex items-center hover:(outline outline-1 outline-blue-300) ${selected
        ? 'bg-gray-300'
        : ''}`}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
        if (showMenu)
          setShowMenu(false)
      }}
      onDoubleClick={onDoubleClicked}
      onContextMenu={(e) => {
        e.preventDefault()

        if (selected)
          setShowMenu(true)
      }}>
      <div className="i-material-symbols-location-on-outline text-gray-500" />
      <EditableLabel value={name} onValueChanged={setName} onValueConfirmed={onPointRenamed} />
      {showMenu && <div className="z-10 relative left-5 top-5 bg-white shadow-(sm blueGray)">
        <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onEditClicked}>编辑</div>
        <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onDeleteClicked}>删除</div>
        <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onRelocateClicked}>重定位机器人</div>
      </div>}
    </div>
  )
}

interface PathItemProps {
  path: NavPath
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  onPathRenamed: (name: string) => void
  onEditClicked: () => void
  onDeleteClicked: () => void
}

const PathItem: React.FC<PathItemProps> = ({ path, selected, onClick, onPathRenamed, onEditClicked, onDeleteClicked }) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(path.name)

  useEffect(() => {
    if (!selected)
      setShowMenu(false)
  }, [selected])

  return (
    <div
      className={`cursor-default h-2rem pl-2 shrink-0 flex items-center hover:(outline outline-1 outline-blue-300) ${selected ? 'bg-gray-300' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
        if (showMenu)
          setShowMenu(false)
      }}
      onContextMenu={(e) => {
        e.preventDefault()

        if (selected)
          setShowMenu(true)
      }}>
      <div className="i-material-symbols-location-on-outline text-gray-500" />
      <EditableLabel value={name} onValueChanged={setName} onValueConfirmed={onPathRenamed} />
      {showMenu && <div className="z-10 relative left-5 top-5 bg-white shadow-(sm blueGray)">
        <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onEditClicked}>编辑</div>
        <div className="text-(sm dark-100) p-1 hover:bg-gray-200" onClick={onDeleteClicked}>删除</div>
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
  const [configPoint, setConfigPoint] = useState<NavPoint>()
  const [configPath, setConfigPath] = useState<NavPath>()

  const { selectedId, select, updateOp } = useOperationStore(state => ({
    selectedId: state.selectedPointId,
    select: state.selectPoint,
    updateOp: state.updateOp,
  }), shallow)
  const {
    profiles, currentProfileId, currentPoints, currentPaths, addProfile, removeProfile, updateCurrentProfile,
    appendCurrentProfilePoint, appendTaskPoint, updateCurrentProfilePoint, removeCurrentProfilePoint,
    setCurrentProfile, updateCurrentProfilePath, removeCurrentProfilePath,
  } = useProfileStore(state => ({
    profiles: state.filterMapProfiles(mapId),
    currentProfileId: state.currentProfileId,
    currentPoints: state.currentProfilePoints(),
    currentPaths: state.currentProfilePaths(),
    addProfile: state.appendProfile,
    removeProfile: state.removeProfile,
    updateCurrentProfile: state.updateCurrentProfile,
    appendCurrentProfilePoint: state.appendCurrentProfilePoint,
    appendTaskPoint: state.appendProfileTaskPoint,
    updateCurrentProfilePoint: state.updateCurrentProfilePoint,
    removeCurrentProfilePoint: state.removeCurrentProfilePoint,
    setCurrentProfile: state.setCurrentProfile,
    updateCurrentProfilePath: state.updateCurrentProfilePath,
    removeCurrentProfilePath: state.removeCurrentProfilePath,
  }))
  const robotInfo = useGridStore(state => state.robotInfo)

  const handleProfileSelected = (profile: NavProfile) => {
    setCurrentProfile(profile.uid)
  }

  const handleProfileDeleted = async (profile: NavProfile) => {
    try {
      await apiServer.deleteProfile(profile.uid)
      removeProfile(profile.uid)
      toast.success('删除成功')
    }
    catch (e) {
      toast.error(`删除失败 ${e}`)
    }
  }

  const addRobotPoint = () => {
    if (!robotInfo)
      return

    const id = uid('Point')
    appendCurrentProfilePoint({
      x: robotInfo.pose.position.x,
      y: -robotInfo.pose.position.y,
      name: `路径点 ${id.slice(-3)}`,
      uid: id,
      rotation: quaternionToCanvasAngle(robotInfo.pose.orientation),
    })
  }

  return (
    <div className="w-12rem border-(r-solid 1px gray-300)">
      <div className="flex h-8 border-(b-solid 1px gray-300)">
        <div className="flex flex-items-center text-3 p-2 cursor-default color-gray-500"
          onClick={() => setShowProfileList(!showProfileList)}>
          <div className="i-material-symbols-keyboard-arrow-down" />配置列表
        </div>
      </div>
      <div className={showProfileList ? 'flex flex-col h-40 overflow-auto' : 'hidden'}>
        <div className="flex justify-between items-center pl pr h-8>">
          <div className="text-3 p-1 cursor-default font-bold">配置</div>
          <div className="i-material-symbols-add"
            onClick={() => addProfile(mapId)} />
        </div>
        {profiles.map((p, i) => {
          const enabled = currentProfileId === p.uid
          return <ProfileItem
            key={i}
            profile={p}
            enabled={enabled}
            onProfileSelected={handleProfileSelected}
            onProfileRenamed={name => updateCurrentProfile({ name })}
            onDeleteClicked={() => handleProfileDeleted(p)} />
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
        <div
            className="i-material-symbols-add-location-outline ml-a mr-4"
            onClick={() => addRobotPoint()} />
      </div>
      <div
        className={'flex flex-col h-[calc(100vh-17.5rem)] overflow-auto'}
        onClick={() => select(null)}>
        {currentDisplay === 'point'
          ? currentPoints.map((p, i) => <PointItem
            key={p.uid}
            point={p}
            selected={selectedId === p.uid}
            onClick={(e) => {
              e.stopPropagation()
              updateOp('select')
              select(p.uid)
            }}
            onEditClicked={() => {
              setConfigPoint(p)
            }}
            onDoubleClicked={() => {
              appendTaskPoint(p)
            }}
            onDeleteClicked={() => {
              removeCurrentProfilePoint(p.uid)
            }}
            onRelocateClicked={async () => {
              if (currentProfileId)
                await apiServer.relocate(currentProfileId, p.uid)
            }}
            onPointRenamed={(name) => {
              updateCurrentProfilePoint(p.uid, { name })
            }}/>)
          : currentPaths.map((p, i) => <PathItem
            key={p.uid}
            path={p}
            selected={selectedId === p.uid}
            onClick={(e) => {
              e.stopPropagation()
              updateOp('select')
              select(p.uid)
            }}
            onPathRenamed={(name) => {
              updateCurrentProfilePath(p.uid, { name })
            }}
            onEditClicked={() => {
              setConfigPath(p)
            }}
            onDeleteClicked={() => {
              removeCurrentProfilePath(p.uid)
            }}/>)}
      </div>
      {configPoint && <PointModal
        point={configPoint}
        onClose={() => setConfigPoint(undefined)} />}
      {configPath && <PathModal
        path={configPath}
        onClose={() => setConfigPath(undefined)} />}
    </div>
  )
}

export default ProfileDeck
