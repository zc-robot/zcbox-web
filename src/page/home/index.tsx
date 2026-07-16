import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'react-hot-toast'
import ParameterViewerModal from './ParameterViewerModal'
import RobotDiagnosticsModal from './RobotDiagnosticsModal'
import apiServer from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'
import { useLocales, usePointCloudZenoh, useRobotPoseZenoh, useTelemetryZenoh } from '@/hooks'

interface MapContextMenuState {
  id: number
  top: number
  left: number
}

interface MapRenameDialogState {
  id: number
  currentName: string
  draftName: string
  error: string | null
}

interface ApiResultLike {
  code?: number
  message?: string
}

type RunningMode = 'mapping' | 'navigation'

function normalizeRunningMode(state: { data?: unknown; message?: string }): RunningMode | null {
  const value = typeof state.data === 'string' && state.data.trim()
    ? state.data.trim()
    : state.message?.trim()

  return value === 'mapping' || value === 'navigation'
    ? value
    : null
}

const Home: React.FC = () => {
  const { locale } = useLocales()
  useRobotPoseZenoh()
  usePointCloudZenoh()

  const { maps, setMaps, setMapsNew, isScanVisible, selectedLidarScanTopics } = useGridStore(state => ({
    maps: state.maps,
    setMaps: state.setMaps,
    setMapsNew: state.setMapsNew,
    isScanVisible: state.isScanVisible,
    selectedLidarScanTopics: state.selectedLidarScanTopics,
  }))

  const apiDomain = useParamsStore(state => state.apiDomain)
  const changeNestController = useParamsStore(state => state.changeNestController)
  const location = useLocation()
  const isMappingRoute = location.pathname === '/mapping'
  useTelemetryZenoh({
    includeMap: isMappingRoute,
    includeScan: isScanVisible,
    scanTopics: selectedLidarScanTopics,
  })
  const navigate = useNavigate()
  const [menuState, setMenuState] = useState<MapContextMenuState | null>(null)
  const [renamingMapId, setRenamingMapId] = useState<number | null>(null)
  const [renameDialog, setRenameDialog] = useState<MapRenameDialogState | null>(null)
  const [showParameterViewer, setShowParameterViewer] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const initMapData = useCallback(async () => {
    const maps = await apiServer.fetchMapList()
    const mapsNew = await apiServer.fetchMapListNew()

    setMaps(maps)
    setMapsNew(mapsNew)
  }, [setMaps, setMapsNew])

  useEffect(() => {
    // 只有当apiDomain不为空时才获取地图数据
    if (apiDomain) {
      // 添加小延迟确保apiServer能够正确获取到新的域名设置
      setTimeout(() => {
        initMapData()
      }, 100)
    }
  }, [initMapData, apiDomain])

  useEffect(() => {
    const closeMenu = () => setMenuState(null)
    window.addEventListener('click', closeMenu)
    window.addEventListener('blur', closeMenu)

    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('blur', closeMenu)
    }
  }, [])

  useEffect(() => {
    setMenuState(null)
  }, [location.pathname])

  const openRenameMapDialog = useCallback((id: number) => {
    setMenuState(null)

    const map = maps.find(item => item.id === id)
    const currentName = map?.name ?? ''
    setRenameDialog({
      id,
      currentName,
      draftName: currentName,
      error: null,
    })
  }, [maps])

  const handleRenameMap = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameDialog)
      return

    const normalizedName = renameDialog.draftName.trim()
    if (!normalizedName) {
      setRenameDialog(current => current ? { ...current, error: '地图名称不能为空' } : current)
      return
    }
    if (normalizedName === renameDialog.currentName) {
      setRenameDialog(null)
      return
    }
    if (!/^[A-Za-z0-9_-]+$/.test(normalizedName)) {
      setRenameDialog(current => current ? { ...current, error: '只能包含字母、数字、_、-，不能包含空格、/ 或 ..' } : current)
      return
    }

    const loadingToast = toast.loading('正在重命名地图...')
    setRenamingMapId(renameDialog.id)
    try {
      const resp = await apiServer.renameMapName(renameDialog.id, normalizedName)
      toast.dismiss(loadingToast)
      if (resp.code !== 0) {
        setRenameDialog(current => current ? { ...current, error: resp.message || '重命名失败' } : current)
        return
      }

      await initMapData()
      setRenameDialog(null)
      toast.success('地图已重命名')
    }
    catch (error) {
      toast.dismiss(loadingToast)
      setRenameDialog(current => current ? { ...current, error: `重命名失败 ${error}` } : current)
    }
    finally {
      setRenamingMapId(null)
    }
  }, [initMapData, renameDialog])

  const handleDeleteMap = useCallback(async (id: number) => {
    setMenuState(null)

    // eslint-disable-next-line no-alert
    const confirmed = confirm('确定删除当前选中的地图？')
    if (!confirmed)
      return

    try {
      const resp = await apiServer.deleteMap(id)
      if (resp.code !== 0) {
        toast.error(resp.message || '删除失败')
        return
      }

      await initMapData()
      if (location.pathname === `/deployment/${id}`)
        navigate('/')
      toast.success('删除成功')
    }
    catch (error) {
      toast.error(`删除失败 ${error}`)
    }
  }, [initMapData, location.pathname, navigate])

  const handleMapSelected = useCallback(async (mapId: number) => {
    let loadingToast = toast.loading('正在检查机器人状态...')

    try {
      const runningState = await apiServer.fetchRunningState()
      const runningMode = normalizeRunningMode(runningState)

      if (runningState.code === 1) {
        const navigationResp = await apiServer.navigation(mapId, 'diff') as ApiResultLike
        if (navigationResp.code != null && navigationResp.code !== 0)
          throw new Error(navigationResp.message || '启动导航失败')
      }
      else if (runningState.code === 0 && runningMode === 'mapping') {
        toast.dismiss(loadingToast)

        // eslint-disable-next-line no-alert
        const confirmed = confirm('当前机器人正在建图，是否停止建图并启动导航？')
        if (!confirmed)
          return

        loadingToast = toast.loading('正在停止建图并启动导航...')
        const navigationResp = await apiServer.navigation(mapId, 'diff') as ApiResultLike
        if (navigationResp.code != null && navigationResp.code !== 0)
          throw new Error(navigationResp.message || '启动导航失败')
      }
      else if (runningState.code === 0 && runningMode === 'navigation') {
        const currentMap = await apiServer.fetchCurrentMap()

        if (currentMap.map_id !== mapId) {
          const changeMapResp = await apiServer.changeMap(mapId)
          if (changeMapResp.code !== 0)
            throw new Error(changeMapResp.message || '切换地图失败')
        }
      }
      else {
        throw new Error(runningState.message || '未知运行状态')
      }

      toast.dismiss(loadingToast)
      navigate(`/deployment/${mapId}`)
    }
    catch (error) {
      toast.dismiss(loadingToast)
      toast.error(`启动导航失败 ${error}`)
    }
  }, [navigate])

  return (
    <div className="flex h-full">
      <div className="flex flex-col w-40 bg-gray-100 border-(r-solid 1px gray-3)">
        <nav>
          <Link
            className="flex flex-(items-center justify-center) py-4 decoration-none"
            to="/mapping">
            <div className="bg-white hover:bg-gray-2 rounded border-(solid 1px gray-5) px-4 py-1 text-gray-5">建图</div>
          </Link>
          {maps.map((m) => {
            const isSelected = location.pathname === `/deployment/${m.id}`
            return (
              <div
                key={m.id}
                className={`flex items-center gap-1 pr-1 ${isSelected ? 'bg-gray-3' : 'hover:bg-gray-3'}`}>
                <NavLink
                  className={`block flex-1 p-1 text-center text-gray-5 decoration-none ${isSelected ? 'font-bold' : ''}`}
                  to={`/deployment/${m.id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    void handleMapSelected(m.id)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setMenuState({
                      id: m.id,
                      left: event.clientX,
                      top: event.clientY,
                    })
                  }}>
                  {`${m.name} (${m.id})`}
                </NavLink>
              </div>
            )
          })}
        </nav>
        {menuState && (
          <div
            className="fixed z-100 min-w-24 rounded border-(solid 1px gray-3) bg-white py-1 shadow-md"
            style={{ left: `${menuState.left}px`, top: `${menuState.top}px` }}
            onClick={event => event.stopPropagation()}>
            <button
              className="w-full border-none bg-transparent px-3 py-1 text-left text-sm text-gray-700 hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={renamingMapId === menuState.id}
              onClick={() => openRenameMapDialog(menuState.id)}>
              重命名地图
            </button>
            <button
              className="w-full border-none bg-transparent px-3 py-1 text-left text-sm text-red-600 hover:bg-gray-2"
              onClick={() => handleDeleteMap(menuState.id)}>
              删除地图
            </button>
          </div>
        )}
        {renameDialog && (
          <div
            className="fixed inset-0 z-110 flex items-center justify-center bg-black/30 px-4"
            onClick={() => {
              if (renamingMapId == null)
                setRenameDialog(null)
            }}>
            <form
              className="w-full max-w-90 rounded-lg border-(solid 1px gray-3) bg-white p-4 shadow-xl"
              onClick={event => event.stopPropagation()}
              onSubmit={handleRenameMap}>
              <div className="text-base font-700 text-gray-8">重命名地图</div>
              <label className="mt-3 block text-sm text-gray-6">
                <span>新地图名称</span>
                <input
                  className="mt-1 w-full rounded border-(solid 1px gray-3) px-3 py-2 text-sm outline-none focus:border-blue-500"
                  autoFocus
                  disabled={renamingMapId === renameDialog.id}
                  placeholder="office_b"
                  value={renameDialog.draftName}
                  onChange={event => setRenameDialog(current => current
                    ? { ...current, draftName: event.target.value, error: null }
                    : current,
                  )}
                />
              </label>
              {renameDialog.error && (
                <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{renameDialog.error}</div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded border-(solid 1px gray-3) bg-white px-3 py-1.5 text-sm text-gray-7 hover:bg-gray-1 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={renamingMapId === renameDialog.id}
                  onClick={() => setRenameDialog(null)}>
                  取消
                </button>
                <button
                  className="rounded border-(solid 1px blue-600) bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  type="submit"
                  disabled={renamingMapId === renameDialog.id}>
                  {renamingMapId === renameDialog.id ? '重命名中...' : '确认'}
                </button>
              </div>
            </form>
          </div>
        )}
        <button
          className="mt-a flex flex-(items-center justify-center) border-(t-solid 1px gray-3) border-x-0 border-b-0 bg-transparent py-3 text-gray-5 hover:bg-gray-2"
          type="button"
          onClick={() => setShowDiagnostics(true)}>
          <div className="i-material-symbols-health-and-safety-outline-rounded mr-2 text-5" />
          <div className="text-3">{locale('robotDiagnostics')}</div>
        </button>
        <button
          className="flex flex-(items-center justify-center) border-(t-solid 1px gray-3) border-x-0 border-b-0 bg-transparent py-3 text-gray-5 hover:bg-gray-2"
          type="button"
          onClick={() => setShowParameterViewer(true)}>
          <div className="i-material-symbols-tune-rounded mr-2 text-5" />
          <div className="text-3">{locale('robotParameters')}</div>
        </button>
        <button
          className="flex flex-(items-center justify-center) border-(t-solid 1px gray-3) border-x-0 border-b-0 bg-transparent py-3 text-gray-5 hover:bg-gray-2"
          type="button"
          title="Change controller"
          onClick={changeNestController}>
          <div className="i-material-symbols-swap-horiz-rounded mr-2 text-5" />
          <div className="text-3">Change controller</div>
        </button>
        <div>
        </div>
      </div>
      <Outlet />
      {showDiagnostics && <RobotDiagnosticsModal onClose={() => setShowDiagnostics(false)} />}
      {showParameterViewer && <ParameterViewerModal onClose={() => setShowParameterViewer(false)} />}
      <Toaster />
    </div>
  )
}

export default Home
