import { useEffect, useRef, useState } from 'react'
import { toNumber } from 'lodash'
import { shallow } from 'zustand/shallow'
import toast from 'react-hot-toast'
import PathModal from './PathModal'
import { useGridStore, useOperationStore, useProfileStore } from '@/store'
import type { DoorType, NavDoor, NavLift, NavPath, NavPoint, NavProfile } from '@/types'
import apiServer from '@/service/apiServer'
import EditableLabel from '@/components/EditableLabel'
import Input from '@/components/Input'
import { useClickOutside, useMenuPosition } from '@/hooks'

type display = 'point' | 'path' | 'door' | 'lift'

function formatDecimal(value: number) {
  return value.toFixed(2)
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100
}

const doorTypeOptions: DoorType[] = ['sliding', 'hinged', 'double_sliding', 'double_hinged']

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
  const [editing, setEditing] = useState(false) // 添加编辑状态
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 }) // 添加鼠标位置状态
  const menuRef = useRef<HTMLDivElement>(null)

  // 使用自定义 Hook 计算菜单位置
  const menuPosition = useMenuPosition(menuRef, showMenu, mousePosition)

  // 点击外部关闭菜单
  useClickOutside(menuRef, () => setShowMenu(false), showMenu)

  useEffect(() => {
    setName(profile.name)
  }, [profile])

  useEffect(() => {
    if (!enabled)
      setShowMenu(false)
  }, [enabled])

  // 当点击重命名时，设置编辑状态为true
  const handleRenameClicked = () => {
    setShowMenu(false)
    setEditing(true)
  }

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

        // 记录鼠标位置
        setMousePosition({ x: e.clientX, y: e.clientY })

        if (enabled)
          setShowMenu(true)
      }}>
      <div
        className={`i-material-symbols-check-small mr-1 ${enabled ? '' : 'invisible'}`} />
      <EditableLabel
        value={name}
        onValueChanged={setName}
        onValueConfirmed={(newName) => {
          onProfileRenamed(newName)
          setEditing(false)
        }}
        editing={editing}
        setEditing={setEditing}
      />
      {showMenu && (
        <div
          ref={menuRef}
          className="z-10 absolute bg-white shadow-(lg blueGray) rounded border border-gray-200 min-w-120px"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={handleRenameClicked}>重命名</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onDeleteClicked}>删除</div>
        </div>
      )}
    </div>
  )
}

interface PointItemProps {
  point: NavPoint
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onDoubleClicked: () => void
  onEditClicked: () => void
  onDeleteClicked: () => void
  onRelocateClicked: () => void
  onPointRenamed: (name: string) => void
}

interface PathItemProps {
  path: NavPath
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onPathRenamed: (name: string) => void
  onEditClicked: () => void
  onDeleteClicked: () => void
}

interface DoorItemProps {
  door: NavDoor
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onDoorRenamed: (name: string) => void
  onDeleteClicked: () => void
}

interface LiftItemProps {
  lift: NavLift
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onLiftRenamed: (name: string) => void
  onDeleteClicked: () => void
}

interface PointDetailsProps {
  point: NavPoint
  onDeleteClicked: () => void
  onSubmit: (point: Partial<NavPoint>) => void
}

interface DoorDetailsProps {
  door: NavDoor
  onDeleteClicked: () => void
  onSubmit: (door: Partial<NavDoor>) => void
}

interface LiftDetailsProps {
  lift: NavLift
  onDeleteClicked: () => void
  onSubmit: (lift: Partial<NavLift>) => void
}

const PointDetails: React.FC<PointDetailsProps> = ({ point, onDeleteClicked, onSubmit }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pointProp, setPointProp] = useState({
    name: point.name,
    x: formatDecimal(point.x),
    y: formatDecimal(-point.y),
    rotation: formatDecimal(point.rotation),
    is_charger: !!point.is_charger,
    is_parking_spot: !!point.is_parking_spot,
  })

  useEffect(() => {
    setPointProp({
      name: point.name,
      x: formatDecimal(point.x),
      y: formatDecimal(-point.y),
      rotation: formatDecimal(point.rotation),
      is_charger: !!point.is_charger,
      is_parking_spot: !!point.is_parking_spot,
    })
  }, [point])

  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div
      ref={containerRef}
      className="mx-2 mb-2 rounded-xl border-(solid 1px gray-200) bg-gray-50 p-3 shadow-sm"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-3 font-bold">{point.uid}</span>
        <span className="text-(2.5 gray-500)">已选中路径点</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Name</span>
        <Input
          className="w-0 min-w-0 flex-1"
          value={pointProp.name}
          onChange={e => setPointProp({ ...pointProp, name: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">X</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={pointProp.x}
          onChange={e => setPointProp({ ...pointProp, x: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Y</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={pointProp.y}
          onChange={e => setPointProp({ ...pointProp, y: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Yaw</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={pointProp.rotation}
          onChange={e => setPointProp({ ...pointProp, rotation: e.target.value })} />
      </div>
      <label className="mt-3 flex items-center justify-between gap-2 text-3">
        <span className="font-bold">Charger</span>
        <input
          type="checkbox"
          checked={pointProp.is_charger}
          onChange={e => setPointProp({ ...pointProp, is_charger: e.target.checked })} />
      </label>
      <label className="mt-2 flex items-center justify-between gap-2 text-3">
        <span className="font-bold">Parking Spot</span>
        <input
          type="checkbox"
          checked={pointProp.is_parking_spot}
          onChange={e => setPointProp({ ...pointProp, is_parking_spot: e.target.checked })} />
      </label>
      <div className="mt-3 flex justify-between">
        <div
          className="rounded-1 border-(solid 1px red-400) p1 text-(sm red-500) cursor-default"
          onClick={onDeleteClicked}>
          删除
        </div>
        <div
          className="rounded-1 bg-gray-300 p1 text-sm cursor-default"
          onClick={() => onSubmit({
            name: pointProp.name,
            x: roundToTwoDecimals(toNumber(pointProp.x)),
            y: roundToTwoDecimals(toNumber(-pointProp.y)),
            rotation: roundToTwoDecimals(toNumber(pointProp.rotation)),
            is_charger: pointProp.is_charger,
            is_parking_spot: pointProp.is_parking_spot,
          })}>
          确认
        </div>
      </div>
    </div>
  )
}

const PointItem: React.FC<PointItemProps> = ({
  point, selected, onClick, onDoubleClicked, onDeleteClicked, onEditClicked, onRelocateClicked, onPointRenamed,
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(point.name)
  const [editing, setEditing] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 }) // 添加鼠标位置状态
  const menuRef = useRef<HTMLDivElement>(null)

  // 使用自定义 Hook 计算菜单位置
  const menuPosition = useMenuPosition(menuRef, showMenu, mousePosition)

  // 点击外部关闭菜单
  useClickOutside(menuRef, () => setShowMenu(false), showMenu)

  useEffect(() => {
    setName(point.name)
  }, [point.name])

  useEffect(() => {
    if (!selected)
      setShowMenu(false)
  }, [selected])

  // 当点击重命名时，设置编辑状态为true
  const handleRenameClicked = () => {
    setShowMenu(false)
    setEditing(true)
  }

  return (
    <div
      className={`cursor-default h-2rem pl-2 shrink-0 flex items-center hover:(outline outline-1 outline-blue-300) ${selected
        ? 'bg-gray-300'
        : ''}`}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault()
        onClick(e)
        if (showMenu)
          setShowMenu(false)
      }}
      onDoubleClick={onDoubleClicked}
      onContextMenu={(e) => {
        e.preventDefault()

        // 记录鼠标位置
        setMousePosition({ x: e.clientX, y: e.clientY })

        if (selected)
          setShowMenu(true)
      }}>
      <div className="i-material-symbols-location-on-outline text-gray-500" />
      <EditableLabel
        value={name}
        onValueChanged={setName}
        onValueConfirmed={(newName) => {
          onPointRenamed(newName)
          setEditing(false)
        }}
        editing={editing}
        setEditing={setEditing}
      />
      {showMenu && (
        <div
          ref={menuRef}
          className="z-10 absolute bg-white shadow-(lg blueGray) rounded border border-gray-200 min-w-120px"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onEditClicked}>编辑</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={handleRenameClicked}>重命名</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onDeleteClicked}>删除</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onRelocateClicked}>重定位机器人</div>
        </div>
      )}
    </div>
  )
}

const PathItem: React.FC<PathItemProps> = ({ path, selected, onClick, onPathRenamed, onEditClicked, onDeleteClicked }) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(path.name)
  const [editing, setEditing] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 }) // 添加鼠标位置状态
  const menuRef = useRef<HTMLDivElement>(null)

  // 使用自定义 Hook 计算菜单位置
  const menuPosition = useMenuPosition(menuRef, showMenu, mousePosition)

  // 点击外部关闭菜单
  useClickOutside(menuRef, () => setShowMenu(false), showMenu)

  useEffect(() => {
    setName(path.name)
  }, [path.name])

  useEffect(() => {
    if (!selected)
      setShowMenu(false)
  }, [selected])

  // 当点击重命名时，设置编辑状态为true
  const handleRenameClicked = () => {
    setShowMenu(false)
    setEditing(true)
  }

  return (
    <div
      className={`cursor-default h-2rem pl-2 shrink-0 flex items-center hover:(outline outline-1 outline-blue-300) ${selected ? 'bg-gray-300' : ''}`}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault()
        onClick(e)
        if (showMenu)
          setShowMenu(false)
      }}
      onContextMenu={(e) => {
        e.preventDefault()

        // 记录鼠标位置
        setMousePosition({ x: e.clientX, y: e.clientY })

        if (selected)
          setShowMenu(true)
      }}>
      <div className="i-material-symbols-location-on-outline text-gray-500" />
      <EditableLabel
        value={name}
        onValueChanged={setName}
        onValueConfirmed={(newName) => {
          onPathRenamed(newName)
          setEditing(false)
        }}
        editing={editing}
        setEditing={setEditing}
      />
      {showMenu && (
        <div
          ref={menuRef}
          className="z-10 absolute bg-white shadow-(lg blueGray) rounded border border-gray-200 min-w-120px"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onEditClicked}>编辑</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={handleRenameClicked}>重命名</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onDeleteClicked}>删除</div>
        </div>
      )}
    </div>
  )
}

const DoorDetails: React.FC<DoorDetailsProps> = ({ door, onDeleteClicked, onSubmit }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [doorProp, setDoorProp] = useState({
    name: door.name,
    x: formatDecimal(door.x),
    y: formatDecimal(-door.y),
    rotation: formatDecimal(door.rotation),
    width: formatDecimal(door.width),
    door_type: door.door_type,
  })

  useEffect(() => {
    setDoorProp({
      name: door.name,
      x: formatDecimal(door.x),
      y: formatDecimal(-door.y),
      rotation: formatDecimal(door.rotation),
      width: formatDecimal(door.width),
      door_type: door.door_type,
    })
  }, [door])

  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div
      ref={containerRef}
      className="mx-2 mb-2 rounded-xl border-(solid 1px gray-200) bg-gray-50 p-3 shadow-sm"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-3 font-bold">{door.uid}</span>
        <span className="text-(2.5 gray-500)">已选中门</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Name</span>
        <Input
          className="w-0 min-w-0 flex-1"
          value={doorProp.name}
          onChange={e => setDoorProp({ ...doorProp, name: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">X</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={doorProp.x}
          onChange={e => setDoorProp({ ...doorProp, x: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Y</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={doorProp.y}
          onChange={e => setDoorProp({ ...doorProp, y: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Yaw</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={doorProp.rotation}
          onChange={e => setDoorProp({ ...doorProp, rotation: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Width</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={doorProp.width}
          onChange={e => setDoorProp({ ...doorProp, width: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Type</span>
        <select
          className="w-0 min-w-0 flex-1 rounded-lg border-(solid 1px gray-300) bg-gray-50 p-2 text-sm"
          value={doorProp.door_type}
          onChange={e => setDoorProp({ ...doorProp, door_type: e.target.value as DoorType })}>
          {doorTypeOptions.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex justify-between">
        <div
          className="rounded-1 border-(solid 1px red-400) p1 text-(sm red-500) cursor-default"
          onClick={onDeleteClicked}>
          删除
        </div>
        <div
          className="rounded-1 bg-gray-300 p1 text-sm cursor-default"
          onClick={() => onSubmit({
            name: doorProp.name,
            x: roundToTwoDecimals(toNumber(doorProp.x)),
            y: roundToTwoDecimals(toNumber(-doorProp.y)),
            rotation: roundToTwoDecimals(toNumber(doorProp.rotation)),
            width: Math.max(0.6, roundToTwoDecimals(toNumber(doorProp.width))),
            door_type: doorProp.door_type,
          })}>
          确认
        </div>
      </div>
    </div>
  )
}

const LiftDetails: React.FC<LiftDetailsProps> = ({ lift, onDeleteClicked, onSubmit }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [liftProp, setLiftProp] = useState({
    name: lift.name,
    x: formatDecimal(lift.x),
    y: formatDecimal(-lift.y),
    rotation: formatDecimal(lift.rotation),
    width: formatDecimal(lift.width),
    depth: formatDecimal(lift.depth),
    level_name: lift.level_name,
  })

  useEffect(() => {
    setLiftProp({
      name: lift.name,
      x: formatDecimal(lift.x),
      y: formatDecimal(-lift.y),
      rotation: formatDecimal(lift.rotation),
      width: formatDecimal(lift.width),
      depth: formatDecimal(lift.depth),
      level_name: lift.level_name,
    })
  }, [lift])

  useEffect(() => {
    containerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div
      ref={containerRef}
      className="mx-2 mb-2 rounded-xl border-(solid 1px gray-200) bg-gray-50 p-3 shadow-sm"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-3 font-bold">{lift.uid}</span>
        <span className="text-(2.5 gray-500)">已选中电梯</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Name</span>
        <Input
          className="w-0 min-w-0 flex-1"
          value={liftProp.name}
          onChange={e => setLiftProp({ ...liftProp, name: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">X</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={liftProp.x}
          onChange={e => setLiftProp({ ...liftProp, x: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Y</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={liftProp.y}
          onChange={e => setLiftProp({ ...liftProp, y: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Yaw</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={liftProp.rotation}
          onChange={e => setLiftProp({ ...liftProp, rotation: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Width</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={liftProp.width}
          onChange={e => setLiftProp({ ...liftProp, width: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Depth</span>
        <Input
          className="w-0 min-w-0 flex-1"
          type="number"
          value={liftProp.depth}
          onChange={e => setLiftProp({ ...liftProp, depth: e.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-3 font-bold">Level</span>
        <Input
          className="w-0 min-w-0 flex-1"
          value={liftProp.level_name}
          onChange={e => setLiftProp({ ...liftProp, level_name: e.target.value })} />
      </div>
      <div className="mt-3 flex justify-between">
        <div
          className="rounded-1 border-(solid 1px red-400) p1 text-(sm red-500) cursor-default"
          onClick={onDeleteClicked}>
          删除
        </div>
        <div
          className="rounded-1 bg-gray-300 p1 text-sm cursor-default"
          onClick={() => onSubmit({
            name: liftProp.name,
            x: roundToTwoDecimals(toNumber(liftProp.x)),
            y: roundToTwoDecimals(toNumber(-liftProp.y)),
            rotation: roundToTwoDecimals(toNumber(liftProp.rotation)),
            width: Math.max(1, roundToTwoDecimals(toNumber(liftProp.width))),
            depth: Math.max(1, roundToTwoDecimals(toNumber(liftProp.depth))),
            level_name: liftProp.level_name,
          })}>
          确认
        </div>
      </div>
    </div>
  )
}

const DoorItem: React.FC<DoorItemProps> = ({ door, selected, onClick, onDoorRenamed, onDeleteClicked }) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(door.name)
  const [editing, setEditing] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const menuPosition = useMenuPosition(menuRef, showMenu, mousePosition)

  useClickOutside(menuRef, () => setShowMenu(false), showMenu)

  useEffect(() => {
    setName(door.name)
  }, [door.name])

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
        setMousePosition({ x: e.clientX, y: e.clientY })
        if (selected)
          setShowMenu(true)
      }}>
      <div className="i-material-symbols-door-front-outline-rounded text-gray-500" />
      <EditableLabel
        value={name}
        onValueChanged={setName}
        onValueConfirmed={(newName) => {
          onDoorRenamed(newName)
          setEditing(false)
        }}
        editing={editing}
        setEditing={setEditing}
      />
      {showMenu && (
        <div
          ref={menuRef}
          className="z-10 absolute bg-white shadow-(lg blueGray) rounded border border-gray-200 min-w-120px"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={() => {
            setShowMenu(false)
            setEditing(true)
          }}>重命名</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onDeleteClicked}>删除</div>
        </div>
      )}
    </div>
  )
}

const LiftItem: React.FC<LiftItemProps> = ({ lift, selected, onClick, onLiftRenamed, onDeleteClicked }) => {
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(lift.name)
  const [editing, setEditing] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const menuPosition = useMenuPosition(menuRef, showMenu, mousePosition)

  useClickOutside(menuRef, () => setShowMenu(false), showMenu)

  useEffect(() => {
    setName(lift.name)
  }, [lift.name])

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
        setMousePosition({ x: e.clientX, y: e.clientY })
        if (selected)
          setShowMenu(true)
      }}>
      <div className="i-material-symbols-elevator-outline-rounded text-gray-500" />
      <EditableLabel
        value={name}
        onValueChanged={setName}
        onValueConfirmed={(newName) => {
          onLiftRenamed(newName)
          setEditing(false)
        }}
        editing={editing}
        setEditing={setEditing}
      />
      {showMenu && (
        <div
          ref={menuRef}
          className="z-10 absolute bg-white shadow-(lg blueGray) rounded border border-gray-200 min-w-120px"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={() => {
            setShowMenu(false)
            setEditing(true)
          }}>重命名</div>
          <div className="text-(sm dark-100) p-2 hover:bg-gray-100 cursor-pointer" onClick={onDeleteClicked}>删除</div>
        </div>
      )}
    </div>
  )
}

export interface ProfileDeckProps {
  mapId: number
}

const ProfileDeck: React.FC<ProfileDeckProps> = ({ mapId }) => {
  const [showProfileList, setShowProfileList] = useState(true)
  const [currentDisplay, setCurrentDisplay] = useState<display>('point')
  const [configPath, setConfigPath] = useState<NavPath>()

  const { selectedId, selectedPointIds, editingPointId, openPointEditor, select, togglePointSelection, updateOp } = useOperationStore(state => ({
    selectedId: state.selectedPointId,
    selectedPointIds: state.selectedPointIds,
    editingPointId: state.editingPointId,
    openPointEditor: state.openPointEditor,
    select: state.selectPoint,
    togglePointSelection: state.togglePointSelection,
    updateOp: state.updateOp,
  }), shallow)
  const {
    profiles, currentProfileId, currentPoints, currentPaths, currentDoors, currentLifts, addProfile, removeProfile, updateCurrentProfile,
    appendCurrentProfilePointFromPose, appendTaskPoint, updateCurrentProfilePoint, removeCurrentProfilePoint,
    setCurrentProfile, updateCurrentProfilePath, removeCurrentProfilePath,
    updateCurrentProfileDoor, removeCurrentProfileDoor, updateCurrentProfileLift, removeCurrentProfileLift,
  } = useProfileStore(state => ({
    profiles: state.filterMapProfiles(mapId),
    currentProfileId: state.currentProfileId,
    currentPoints: state.currentProfilePoints(),
    currentPaths: state.currentProfilePaths(),
    currentDoors: state.currentProfileDoors(),
    currentLifts: state.currentProfileLifts(),
    addProfile: state.appendProfile,
    removeProfile: state.removeProfile,
    updateCurrentProfile: state.updateCurrentProfile,
    appendCurrentProfilePointFromPose: state.appendCurrentProfilePointFromPose,
    appendTaskPoint: state.appendProfileTaskPoint,
    updateCurrentProfilePoint: state.updateCurrentProfilePoint,
    removeCurrentProfilePoint: state.removeCurrentProfilePoint,
    setCurrentProfile: state.setCurrentProfile,
    updateCurrentProfilePath: state.updateCurrentProfilePath,
    removeCurrentProfilePath: state.removeCurrentProfilePath,
    updateCurrentProfileDoor: state.updateCurrentProfileDoor,
    removeCurrentProfileDoor: state.removeCurrentProfileDoor,
    updateCurrentProfileLift: state.updateCurrentProfileLift,
    removeCurrentProfileLift: state.removeCurrentProfileLift,
  }))
  const robotInfo = useGridStore(state => state.robotInfo)
  const configPoint = currentPoints.find(point => point.uid === editingPointId)
  const configDoor = selectedId?.startsWith('Door')
    ? currentDoors.find(door => door.uid === selectedId)
    : undefined
  const configLift = selectedId?.startsWith('Lift')
    ? currentLifts.find(lift => lift.uid === selectedId)
    : undefined

  useEffect(() => {
    if (selectedId?.startsWith('Point')) {
      setCurrentDisplay('point')
      if (editingPointId !== selectedId)
        openPointEditor(selectedId)
      return
    }

    if (selectedId?.startsWith('Path')) {
      setCurrentDisplay('path')
      if (editingPointId)
        openPointEditor(null)
      return
    }

    if (selectedId?.startsWith('Door')) {
      setCurrentDisplay('door')
      if (editingPointId)
        openPointEditor(null)
      return
    }

    if (selectedId?.startsWith('Lift')) {
      setCurrentDisplay('lift')
      if (editingPointId)
        openPointEditor(null)
      return
    }

    if (editingPointId)
      openPointEditor(null)
  }, [editingPointId, openPointEditor, selectedId])

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
    if (!robotInfo) {
      toast.error('暂无机器人位姿')
      return
    }

    const id = appendCurrentProfilePointFromPose(robotInfo.pose)
    if (!id) {
      toast.error('请先选择配置')
      return
    }

    select(id)
    openPointEditor(id)
  }

  const activateCurrentDisplayTool = () => {
    if (!currentProfileId) {
      toast.error('请先选择配置')
      return
    }

    if (currentDisplay === 'point') {
      addRobotPoint()
      return
    }

    if (currentDisplay === 'path') {
      updateOp('pathway')
      return
    }

    if (currentDisplay === 'door') {
      updateOp('door')
      return
    }

    updateOp('lift')
  }

  const currentDisplayActionIcon = currentDisplay === 'point'
    ? 'i-material-symbols-add-location-outline'
    : currentDisplay === 'path'
      ? 'i-material-symbols-edit-road-outline-rounded'
      : currentDisplay === 'door'
        ? 'i-material-symbols-door-front-outline-rounded'
        : 'i-material-symbols-elevator-outline-rounded'

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
        {profiles.map((p) => {
          const enabled = currentProfileId === p.uid
          return <ProfileItem
            key={p.uid}
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
          className={`text-3 p-1 cursor-default ${currentDisplay === 'door'
          ? 'font-bold'
          : 'color-gray-500 hover:color-black'}`}
          onClick={() => setCurrentDisplay('door')}>门</div>
        <div
          className={`text-3 p-1 cursor-default ${currentDisplay === 'lift'
          ? 'font-bold'
          : 'color-gray-500 hover:color-black'}`}
          onClick={() => setCurrentDisplay('lift')}>电梯</div>
        <div
            className={`${currentDisplayActionIcon} ml-a mr-4`}
            onClick={activateCurrentDisplayTool} />
      </div>
      <div
        className={'flex flex-col h-[calc(100vh-17.5rem)] overflow-auto'}
        onClick={() => select(null)}>
        {currentDisplay === 'point'
          ? currentPoints.map(p => <div
            key={p.uid}>
            <PointItem
              point={p}
              selected={selectedPointIds.includes(p.uid)}
              onClick={(e) => {
                e.stopPropagation()
                updateOp('select')
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  togglePointSelection(p.uid)
                  return
                }

                select(p.uid)
              }}
              onEditClicked={() => {
                openPointEditor(p.uid)
                select(p.uid)
                updateOp('select')
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
              }}
            />
            {configPoint?.uid === p.uid && (
              <PointDetails
                point={configPoint}
                onDeleteClicked={() => {
                  removeCurrentProfilePoint(p.uid)
                  openPointEditor(null)
                  select(null)
                }}
                onSubmit={(point) => {
                  updateCurrentProfilePoint(p.uid, point)
                }}
              />
            )}
          </div>)
          : currentDisplay === 'path'
            ? currentPaths.map(p => <PathItem
              key={p.uid}
              path={p}
              selected={selectedId === p.uid}
              onClick={(e) => {
                e.stopPropagation()
                updateOp('select')
                select(p.uid)
              }}
              onPathRenamed={(name: string) => {
                updateCurrentProfilePath(p.uid, { name })
              }}
              onEditClicked={() => {
                setConfigPath(p)
              }}
              onDeleteClicked={() => {
                removeCurrentProfilePath(p.uid)
              }}
            />)
            : currentDisplay === 'door'
              ? currentDoors.map(d => <div key={d.uid}>
                <DoorItem
                  door={d}
                  selected={selectedId === d.uid}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateOp('select')
                    select(d.uid)
                  }}
                  onDoorRenamed={(name) => {
                    updateCurrentProfileDoor(d.uid, { name })
                  }}
                  onDeleteClicked={() => {
                    removeCurrentProfileDoor(d.uid)
                    if (selectedId === d.uid)
                      select(null)
                  }}
                />
                {configDoor?.uid === d.uid && (
                  <DoorDetails
                    door={configDoor}
                    onDeleteClicked={() => {
                      removeCurrentProfileDoor(d.uid)
                      select(null)
                    }}
                    onSubmit={(door) => {
                      updateCurrentProfileDoor(d.uid, door)
                    }}
                  />
                )}
              </div>)
              : currentLifts.map(l => <div key={l.uid}>
                <LiftItem
                  lift={l}
                  selected={selectedId === l.uid}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateOp('select')
                    select(l.uid)
                  }}
                  onLiftRenamed={(name) => {
                    updateCurrentProfileLift(l.uid, { name })
                  }}
                  onDeleteClicked={() => {
                    removeCurrentProfileLift(l.uid)
                    if (selectedId === l.uid)
                      select(null)
                  }}
                />
                {configLift?.uid === l.uid && (
                  <LiftDetails
                    lift={configLift}
                    onDeleteClicked={() => {
                      removeCurrentProfileLift(l.uid)
                      select(null)
                    }}
                    onSubmit={(lift) => {
                      updateCurrentProfileLift(l.uid, lift)
                    }}
                  />
                )}
              </div>)}
      </div>
      {configPath && <PathModal
        path={configPath}
        onClose={() => setConfigPath(undefined)} />}
    </div>
  )
}

export default ProfileDeck
