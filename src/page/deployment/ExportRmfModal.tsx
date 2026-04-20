import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import type { MapListItem, NavProfile } from '@/types'
import apiServer from '@/service/apiServer'
import { useGridStore } from '@/store'

export interface ExportRmfSelection {
  map: MapListItem
  profile: NavProfile
}

interface ExportRmfModalProps {
  currentMapId: number
  currentProfileUid?: string
  onClose: () => void
  onConfirm: (selections: ExportRmfSelection[]) => void
}

function removeMapValue<T>(record: Record<number, T>, mapId: number) {
  const next = { ...record }
  delete next[mapId]
  return next
}

const ExportRmfModal: React.FC<ExportRmfModalProps> = ({
  currentMapId,
  currentProfileUid,
  onClose,
  onConfirm,
}) => {
  const { mapsNew, setMapsNew } = useGridStore(state => ({
    mapsNew: state.mapsNew,
    setMapsNew: state.setMapsNew,
  }))
  const [isLoadingMaps, setIsLoadingMaps] = useState(false)
  const [selectedMapIds, setSelectedMapIds] = useState<number[]>(currentMapId ? [currentMapId] : [])
  const [profilesByMapId, setProfilesByMapId] = useState<Record<number, NavProfile[]>>({})
  const [selectedProfileIds, setSelectedProfileIds] = useState<Record<number, string>>(
    currentMapId && currentProfileUid ? { [currentMapId]: currentProfileUid } : {},
  )
  const [loadingProfileIds, setLoadingProfileIds] = useState<number[]>([])

  useEffect(() => {
    const loadMaps = async () => {
      if (mapsNew.length > 0)
        return

      setIsLoadingMaps(true)
      try {
        const fetchedMaps = await apiServer.fetchMapListNew()
        setMapsNew(fetchedMaps)
      }
      catch (error) {
        toast.error(`获取地图列表失败 ${error}`)
      }
      finally {
        setIsLoadingMaps(false)
      }
    }

    void loadMaps()
  }, [mapsNew.length, setMapsNew])

  const orderedSelectedMaps = useMemo(
    () => mapsNew.filter(map => selectedMapIds.includes(map.id)),
    [mapsNew, selectedMapIds],
  )

  const loadProfiles = useCallback(async (map: MapListItem) => {
    if (profilesByMapId[map.id] || loadingProfileIds.includes(map.id))
      return

    setLoadingProfileIds(prev => [...prev, map.id])
    try {
      const profiles = await apiServer.fetchMapDeployment(map.id)
      setProfilesByMapId(prev => ({ ...prev, [map.id]: profiles }))
      setSelectedProfileIds((prev) => {
        const existingProfileId = prev[map.id]
        if (existingProfileId && profiles.some(profile => profile.uid === existingProfileId))
          return prev

        const defaultProfileId = map.id === currentMapId && currentProfileUid && profiles.some(profile => profile.uid === currentProfileUid)
          ? currentProfileUid
          : profiles[0]?.uid

        if (!defaultProfileId)
          return prev

        return {
          ...prev,
          [map.id]: defaultProfileId,
        }
      })
    }
    catch (error) {
      toast.error(`获取 ${map.name} 的部署配置失败 ${error}`)
    }
    finally {
      setLoadingProfileIds(prev => prev.filter(id => id !== map.id))
    }
  }, [currentMapId, currentProfileUid, loadingProfileIds, profilesByMapId])

  useEffect(() => {
    orderedSelectedMaps.forEach((map) => {
      void loadProfiles(map)
    })
  }, [loadProfiles, orderedSelectedMaps])

  const handleMapToggle = (mapId: number, checked: boolean) => {
    setSelectedMapIds((prev) => {
      if (checked) {
        if (prev.includes(mapId))
          return prev

        return mapsNew
          .filter(map => prev.includes(map.id) || map.id === mapId)
          .map(map => map.id)
      }

      return prev.filter(id => id !== mapId)
    })

    if (!checked) {
      setSelectedProfileIds(prev => removeMapValue(prev, mapId))
      setProfilesByMapId(prev => removeMapValue(prev, mapId))
      setLoadingProfileIds(prev => prev.filter(id => id !== mapId))
    }
  }

  const canConfirm = orderedSelectedMaps.length > 0
    && orderedSelectedMaps.every((map) => {
      const profiles = profilesByMapId[map.id]
      const selectedProfileId = selectedProfileIds[map.id]

      return profiles != null
        && profiles.length > 0
        && selectedProfileId != null
        && profiles.some(profile => profile.uid === selectedProfileId)
    })

  const handleConfirm = () => {
    if (!canConfirm)
      return

    const selections = orderedSelectedMaps.map((map) => {
      const profiles = profilesByMapId[map.id]
      const selectedProfileId = selectedProfileIds[map.id]
      const profile = profiles.find(item => item.uid === selectedProfileId)

      return profile
        ? { map, profile }
        : null
    }).filter((selection): selection is ExportRmfSelection => selection != null)

    if (selections.length === 0) {
      toast.error('请选择至少一个有效的部署配置')
      return
    }

    onConfirm(selections)
  }

  return (
    <div
      className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-(justify-center items-center) bg-gray-900/30"
      onClick={onClose}>
      <div
        className="flex flex-col border-(solid 1px gray-300) shadow-md w-42rem max-w-90vw min-h-24rem max-h-85vh p-4 bg-white rounded-2xl"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-end text-3">
          <span className="text-5 font-bold mr-3">生成RMF配置文件</span>
          <span className="text-gray-500">选择地图层和对应部署配置</span>
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5"
            onClick={onClose} />
        </div>
        <div className="mt-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-600">
          导出的 level 名称使用地图名称。可以同时勾选多个地图，每个地图选择一个部署配置后合并导出。
        </div>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 min-h-0 flex-1 overflow-hidden">
          <div className="border-(solid 1px gray-200) rounded-xl p-3 overflow-auto">
            <div className="font-bold mb-3">地图列表</div>
            {isLoadingMaps && mapsNew.length === 0 && (
              <div className="text-sm text-gray-500">正在加载地图列表...</div>
            )}
            {!isLoadingMaps && mapsNew.length === 0 && (
              <div className="text-sm text-gray-500">暂无地图可选</div>
            )}
            <div className="flex flex-col gap-2">
              {mapsNew.map(map => (
                <label
                  key={map.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMapIds.includes(map.id)}
                    onChange={event => handleMapToggle(map.id, event.target.checked)} />
                  <div className="flex flex-col">
                    <span className="font-medium">{map.name}</span>
                    <span className="text-xs text-gray-500">{`地图 ID: ${map.id}`}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="border-(solid 1px gray-200) rounded-xl p-3 overflow-auto">
            <div className="font-bold mb-3">部署配置</div>
            {orderedSelectedMaps.length === 0 && (
              <div className="text-sm text-gray-500">先在左侧勾选至少一个地图。</div>
            )}
            <div className="flex flex-col gap-4">
              {orderedSelectedMaps.map((map) => {
                const profiles = profilesByMapId[map.id]
                const isLoadingProfiles = loadingProfileIds.includes(map.id)
                const selectedProfileId = selectedProfileIds[map.id] ?? ''

                return (
                  <div key={map.id} className="rounded-lg border-(solid 1px gray-200) p-3">
                    <div className="font-medium">{map.name}</div>
                    <div className="text-xs text-gray-500 mb-2">{`导出为 level: ${map.name}`}</div>
                    {isLoadingProfiles && (
                      <div className="text-sm text-gray-500">正在加载部署配置...</div>
                    )}
                    {!isLoadingProfiles && profiles && profiles.length === 0 && (
                      <div className="text-sm text-red-500">该地图没有可导出的部署配置。</div>
                    )}
                    {!isLoadingProfiles && profiles && profiles.length > 0 && (
                      <select
                        className="w-full bg-gray-50 border-(solid 1px gray-300) text-sm rounded-lg p-2"
                        value={selectedProfileId}
                        onChange={event => setSelectedProfileIds(prev => ({
                          ...prev,
                          [map.id]: event.target.value,
                        }))}>
                        {profiles.map(profile => (
                          <option key={profile.uid} value={profile.uid}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button
            className="border-none bg-gray-200 px-4 py-2 rounded-lg text-sm"
            onClick={onClose}>
            取消
          </button>
          <button
            className={`border-none px-4 py-2 rounded-lg text-sm ${canConfirm ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}
            disabled={!canConfirm}
            onClick={handleConfirm}>
            导出
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportRmfModal
