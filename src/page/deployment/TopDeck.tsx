import React, { useCallback, useEffect, useRef, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import toast from 'react-hot-toast'
import BatchRenameWaypointsModal from './BatchRenameWaypointsModal'
import ExportRmfModal from './ExportRmfModal'
import NavigationTransitionEventsModal from './NavigationTransitionEventsModal'
import RedistributeWaypointsModal from './RedistributeWaypointsModal'
import GenerateLanesModal from './GenerateLanesModal'
import RotateLineWaypointsModal from './RotateLineWaypointsModal'
import ShelfStateModal from './ShelfStateModal'
import type { ExportRmfAlignment, ExportRmfSelection } from './ExportRmfModal'
import CameraStreamControls from '@/components/CameraStreamControls'
import CostmapControls from '@/components/CostmapControls'
import LidarScanControls from '@/components/LidarScanControls'
import PointCloudControls from '@/components/PointCloudControls'
import { RobotToolButton, RobotToolGroup } from '@/components/RobotToolbar'
import { useBoundStore, useGridStore, useOperationStore, useParamsStore, useProfileStore } from '@/store'
import apiServer from '@/service/apiServer'
import { createDockingPoseRequest, createDockingWaypoint } from '@/service/dockingPose'
import { createGeneratedLanePaths } from '@/service/laneGeneration'
import type { GenerateLanesData } from '@/service/laneGeneration'
import type { GridInfoMessage, NavPoint, NavProfile, PointMessage, RobotStatus } from '@/types'
import { useKeyPress } from '@/hooks'
import { parseFiniteNumber, parseRobotStatus, uid } from '@/util'
import { canvasAngleToQuaternion, convertMapRasterToPngBlob, parseMapRaster, renderAlignedMapRasterToPngBlob } from '@/util/transform'
import { buildAlignedNav2MapYaml, resolveAlignedNav2MapResolution } from '@/util/nav2MapYaml'
import { buildRmfBuildingYaml, createAlignedMapImageLayout, createGridInfoWithImageDimensions, sanitizeRmfFileName, transformNavProfileToAlignedMapFrame } from '@/util/rmf'
import { getEvenlyRedistributedWaypoints, getWaypointRedistributionSpacing, getWaypointsOnSameLine, orderWaypointsByLineProjection } from '@/util/waypoints'

type ExecuteWaypointNavType = 'auto' | 'manually'
type NavigationRestartState = 'restarting' | 'succeeded' | 'failed'

const EXECUTABLE_ROBOT_STATUSES = new Set<RobotStatus>(['idle', 'succeeded', 'failed', 'canceled'])
const CHARGER_SIDE_LABELS = {
  front: '前侧',
  back: '后侧',
  left: '左侧',
  right: '右侧',
}

export interface TopDeckProps {
  mapId: number
}

interface ApiResultLike {
  code?: number
  message?: string
}

interface PreparedRmfMapImage {
  filename: string
  blob: Blob
  updatedProfile?: NavProfile
  localUpdate?: {
    mapName: string
    localizationPng: Blob
    localizationYaml: Blob
    navigationPng: Blob
    navigationYaml: Blob
  }
}

function createAlignedGridInfo(width: number, height: number, resolution: number): GridInfoMessage {
  return {
    width,
    height,
    resolution,
    origin: {
      position: {
        x: 0,
        y: -height * resolution,
        z: 0,
      },
      orientation: {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      },
      pyr: {
        pitch: 0,
        roll: 0,
        yaw: 0,
      },
    },
  }
}

function createSelectedWaypointTaskUid() {
  return `selected_waypoints_${Date.now()}`
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return element != null && (
    element.tagName === 'INPUT'
    || element.tagName === 'TEXTAREA'
    || element.isContentEditable
  )
}

const TopDeck: React.FC<TopDeckProps> = ({ mapId }) => {
  const [showExportModal, setShowExportModal] = useState(false)
  const [showBatchRenameModal, setShowBatchRenameModal] = useState(false)
  const [showRedistributeModal, setShowRedistributeModal] = useState(false)
  const [showRotateLineModal, setShowRotateLineModal] = useState(false)
  const [laneGeneration, setLaneGeneration] = useState<{ profileUid: string; points: NavPoint[] } | null>(null)
  const [showShelfStateModal, setShowShelfStateModal] = useState(false)
  const [showNavigationTransitionEvents, setShowNavigationTransitionEvents] = useState(false)
  const [navigationRestartState, setNavigationRestartState] = useState<NavigationRestartState>('restarting')
  const navigationTransitionReadyRef = useRef<((ready: boolean) => void) | null>(null)
  const [showExecuteOptions, setShowExecuteOptions] = useState(false)
  const [isCalculatingDockingPose, setIsCalculatingDockingPose] = useState(false)
  const [rmfUploadHost, setRmfUploadHost] = useState(() => apiServer.defaultRmfWebVizHost)
  const [isUploadingRmf, setIsUploadingRmf] = useState(false)
  const [isRestartingRmf, setIsRestartingRmf] = useState(false)
  const rmfRestartPending = useRef(false)
  const [toolCategory, setToolCategory] = useState<'edit' | 'points' | 'robot' | 'view' | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [executePreciseXY, setExecutePreciseXY] = useState('0.05')
  const [executePreciseRad, setExecutePreciseRad] = useState('0.05')
  const [executeNavType, setExecuteNavType] = useState<ExecuteWaypointNavType>('auto')
  const [executeActionId, setExecuteActionId] = useState('')
  const [relocalizationUseAbsolute, setRelocalizationUseAbsolute] = useState(false)
  const { zoom, gridInfo, robotInfo, robotStatus, hasLivePose, updateRobotFsm, updateLocalizationQuality, setMapGrid, setPathPointInfo, mapsNew, setMapsNew, isScanVisible, setScanVisibility, updateScanPointSize, requestCenterRobot, requestCenterMap, relocalizationPose, beginRelocalization, cancelRelocalization } = useGridStore(state => ({
    zoom: state.zoom,
    gridInfo: state.gridInfo,
    robotInfo: state.robotInfo,
    robotStatus: state.robotInfo?.fsm,
    hasLivePose: state.hasLivePose,
    updateRobotFsm: state.updateRobotFsm,
    updateLocalizationQuality: state.updateLocalizationQuality,
    setMapGrid: state.setMapGrid,
    setPathPointInfo: state.setPathPointInfo,
    mapsNew: state.mapsNew,
    setMapsNew: state.setMapsNew,
    isScanVisible: state.isScanVisible,
    setScanVisibility: state.setScanVisibility,
    updateScanPointSize: state.updateScanPointSize,
    requestCenterRobot: state.requestCenterRobot,
    requestCenterMap: state.requestCenterMap,
    relocalizationPose: state.relocalizationPose,
    beginRelocalization: state.beginRelocalization,
    cancelRelocalization: state.cancelRelocalization,
  }))
  const { currentOp, selectedId, selectedPointIds, selectPoint, selectPoints, updateOp, openPointEditor } = useOperationStore(state => ({
    currentOp: state.current,
    selectedId: state.selectedPointId,
    selectedPointIds: state.selectedPointIds,
    selectPoint: state.selectPoint,
    selectPoints: state.selectPoints,
    updateOp: state.updateOp,
    openPointEditor: state.openPointEditor,
  }))
  const { currentProfile, currentTask, currentPoints, addProfiles, appendCurrentProfilePoint, appendCurrentProfilePointFromPose, updateCurrentProfilePoints, rotateCurrentProfileLineWaypoints } = useProfileStore(state => ({
    currentProfile: state.currentProfile,
    currentTask: state.getCurrentTask,
    currentPoints: state.currentProfilePoints,
    addProfiles: state.addProfiles,
    appendCurrentProfilePoint: state.appendCurrentProfilePoint,
    appendCurrentProfilePointFromPose: state.appendCurrentProfilePointFromPose,
    updateCurrentProfilePoints: state.updateCurrentProfilePoints,
    rotateCurrentProfileLineWaypoints: state.rotateCurrentProfileLineWaypoints,
  }))
  const pointActions = useParamsStore(state => state.pointActions)
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const pointMap = new Map(currentPoints().map(point => [point.uid, point]))
  const selectedWaypoints = selectedPointIds
    .map(id => pointMap.get(id))
    .filter((point): point is NavPoint => point != null)
  const openLaneGeneration = () => {
    const profile = currentProfile()
    if (!profile || profile.map_id !== mapId) {
      toast.error('请先选择当前地图的配置')
      return
    }
    const points = selectedWaypoints.length ? selectedWaypoints : profile.data.waypoints
    if (points.length < 2 || points.length > 200) {
      toast.error('请选择 2–200 个路径点；未选中时使用当前配置的全部路径点')
      return
    }
    setLaneGeneration({ profileUid: profile.uid, points: points.map(point => ({ ...point })) })
  }
  const applyGeneratedLanes = (result: GenerateLanesData) => {
    if (!laneGeneration)
      return
    const state = useBoundStore.getState()
    const profile = state.currentProfile()
    if (!profile || profile.uid !== laneGeneration.profileUid || profile.map_id !== result.map_id
      || laneGeneration.points.some(point => !profile.data.waypoints.some(current => current.uid === point.uid && current.x === point.x && current.y === point.y))) {
      toast.error('配置或路径点已变化，请重新生成车道')
      setLaneGeneration(null)
      return
    }
    try {
      const paths = createGeneratedLanePaths(laneGeneration.points, result.lanes, profile.data.paths ?? [], () => uid('Path'))
      state.updateCurrentProfile({ data: { ...profile.data, paths: [...(profile.data.paths ?? []), ...paths] } })
      setLaneGeneration(null)
      toast.success(`已添加 ${paths.length} 条车道，请检查后保存配置`)
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '添加车道失败')
    }
  }
  const handleNavigationTransitionReady = useCallback(() => {
    navigationTransitionReadyRef.current?.(true)
  }, [])

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)
  const centerRobotOnCanvas = () => {
    if (!robotInfo || !hasLivePose) {
      toast.error('暂无机器人位姿')
      return
    }

    requestCenterRobot()
  }
  const centerMapOnCanvas = () => {
    if (!gridInfo) {
      toast.error('暂无地图')
      return
    }

    requestCenterMap()
  }
  const submitDeploymentProfile = (profile: NavProfile) => {
    return apiServer.submitProfile({
      map_id: profile.map_id,
      uid: profile.uid,
      name: profile.name,
      description: profile.description,
      waypoints: profile.data.waypoints,
      paths: profile.data.paths,
      doors: profile.data.doors ?? [],
      lifts: profile.data.lifts ?? [],
    })
  }
  const toggleScanVisibility = () => setScanVisibility(!isScanVisible)
  const increaseScanPointSize = () => updateScanPointSize(0.01)
  const decreaseScanPointSize = () => updateScanPointSize(-0.01)
  const activateMoveMode = () => updateOp('move')
  const activateSelectMode = () => updateOp('select')
  const activateManualWaypointPlacement = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    openPointEditor(null)
    updateOp('waypoint')
  }
  const activateLineWaypointPlacement = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    openPointEditor(null)
    updateOp('waypointLine')
  }
  const activatePathMode = () => updateOp('pathway')
  const activateDoorMode = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    updateOp('door')
  }
  const activateLiftMode = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    updateOp('lift')
  }

  const captureRobotWaypoint = () => {
    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    if (!robotInfo || !hasLivePose) {
      toast.error('暂无机器人位姿')
      return
    }

    const id = appendCurrentProfilePointFromPose(robotInfo.pose)
    if (!id) {
      toast.error('路径点创建失败')
      return
    }

    openPointEditor(id)
    selectPoint(id)
    toast.success('已采集当前位置为路径点')
  }

  const createDockingStartWaypoint = async () => {
    if (isCalculatingDockingPose)
      return

    if (!currentProfile()) {
      toast.error('请先选择配置')
      return
    }

    if (!robotInfo || !hasLivePose) {
      toast.error('暂无机器人位姿')
      return
    }

    const loadingToast = toast.loading('正在计算对接起点...')
    setIsCalculatingDockingPose(true)
    try {
      const result = await apiServer.calculateDockingPose(createDockingPoseRequest(robotInfo.pose))
      const id = uid('Point')
      appendCurrentProfilePoint(createDockingWaypoint(id, result))
      updateOp('select')
      selectPoint(id)
      openPointEditor(id)
      toast.dismiss(loadingToast)
      toast.success(`已创建对接起点（充电器在机器人${CHARGER_SIDE_LABELS[result.charger_side]}，偏移 ${result.offset_distance} m）`)
    }
    catch (error) {
      toast.dismiss(loadingToast)
      console.error('创建对接起点失败:', error)
      toast.error('创建对接起点失败，请检查机器人几何和充电器配置')
    }
    finally {
      setIsCalculatingDockingPose(false)
    }
  }

  const applyRedistributedWaypoints = (spacing?: number) => {
    if (selectedPointIds.length < 2) {
      toast.error('请先选择至少两个路径点')
      return
    }

    const pointMap = new Map(currentPoints().map(point => [point.uid, point]))
    const selectedPoints = selectedPointIds
      .map(id => pointMap.get(id))
      .filter((point): point is NavPoint => point != null)
    const layout = getEvenlyRedistributedWaypoints(selectedPoints, spacing)

    if (!layout) {
      toast.error('路径点距离过近，无法重排')
      return
    }

    updateCurrentProfilePoints(layout.updates)
    selectPoints(layout.orderedPoints.map(point => point.uid), layout.orderedPoints[layout.orderedPoints.length - 1].uid)
    setShowRedistributeModal(false)
    toast.success('已等距重排路径点')
  }

  const openRedistributeModal = () => {
    if (selectedPointIds.length < 2) {
      toast.error('请先选择至少两个路径点')
      return
    }

    setShowRedistributeModal(true)
  }

  const selectedWaypointRedistributionSpacing = getWaypointRedistributionSpacing(selectedWaypoints)

  const getSelectedWaypointsForNavigation = () => {
    if (selectedWaypoints.length < 2)
      return selectedWaypoints

    const lineIds = new Set(
      selectedWaypoints
        .map(point => point.line_constraint?.uid)
        .filter((lineUid): lineUid is string => lineUid != null),
    )

    if (lineIds.size === 1) {
      const orderedLinePoints = orderWaypointsByLineProjection(selectedWaypoints)
      if (orderedLinePoints)
        return orderedLinePoints
    }

    return selectedWaypoints
  }

  const getSelectedLineWaypoints = () => {
    const points = currentPoints()
    const pointMap = new Map(points.map(point => [point.uid, point]))
    const primaryId = selectedId?.startsWith('Point')
      ? selectedId
      : selectedPointIds[0]
    const primaryPoint = primaryId
      ? pointMap.get(primaryId)
      : undefined

    return getWaypointsOnSameLine(points, primaryPoint)
  }

  const selectCurrentWaypointLine = () => {
    const linePoints = getSelectedLineWaypoints()
    if (linePoints.length < 2) {
      toast.error('请先选择等距路径点线上的路径点')
      return
    }

    const primaryId = selectedId?.startsWith('Point') && linePoints.some(point => point.uid === selectedId)
      ? selectedId
      : linePoints[linePoints.length - 1].uid

    updateOp('select')
    selectPoints(linePoints.map(point => point.uid), primaryId)
    toast.success('已选择整条线，拖动主路径点可整体移动')
  }

  const openRotateLineModal = () => {
    const linePoints = getSelectedLineWaypoints()
    if (linePoints.length < 2) {
      toast.error('请先选择等距路径点线上的路径点')
      return
    }

    setShowRotateLineModal(true)
  }

  const handleRotateLineWaypoints = (angleDegrees: number) => {
    const linePoints = getSelectedLineWaypoints()
    const lineUid = linePoints[0]?.line_constraint?.uid
    if (!lineUid) {
      toast.error('请先选择等距路径点线上的路径点')
      return
    }

    const rotated = rotateCurrentProfileLineWaypoints(lineUid, angleDegrees)
    if (!rotated) {
      toast.error('整线旋转失败')
      return
    }

    const primaryId = selectedId?.startsWith('Point') && linePoints.some(point => point.uid === selectedId)
      ? selectedId
      : linePoints[linePoints.length - 1].uid
    selectPoints(linePoints.map(point => point.uid), primaryId)
    setShowRotateLineModal(false)
    toast.success('已旋转整条线')
  }

  const openBatchRenameModal = () => {
    if (selectedPointIds.length < 2) {
      toast.error('请先选择至少两个路径点')
      return
    }

    setShowBatchRenameModal(true)
  }

  const handleBatchRenameWaypoints = (updates: { uid: string; name: string }[]) => {
    if (updates.length === 0)
      return

    updateCurrentProfilePoints(updates.map(update => ({
      uid: update.uid,
      point: {
        name: update.name,
      },
    })))
    selectPoints(updates.map(update => update.uid), updates[updates.length - 1].uid)
    setShowBatchRenameModal(false)
    toast.success('路径点已重命名')
  }

  const toggleRelocalization = () => {
    if (currentOp === 'relocalize') {
      cancelRelocalization()
      updateOp('move')
      return
    }

    if (!robotInfo || !hasLivePose) {
      toast.error('暂无机器人位姿')
      return
    }

    if (!isScanVisible)
      setScanVisibility(true)

    setRelocalizationUseAbsolute(false)
    beginRelocalization()
    updateOp('relocalize')
  }

  const handleRelocalizationConfirm = async () => {
    if (!relocalizationPose) {
      toast.error('暂无重定位位姿')
      return
    }

    const loadingToast = toast.loading('正在发送重定位...')
    try {
      await apiServer.setPose(relocalizationPose, relocalizationUseAbsolute)
      toast.dismiss(loadingToast)
      toast.success('重定位已发送')
      cancelRelocalization()
      updateOp('move')
    }
    catch (error) {
      toast.dismiss(loadingToast)
      toast.error(`重定位失败 ${error}`)
    }
  }

  const toggleExecuteWaypointOptions = () => {
    if (selectedWaypoints.length === 0) {
      toast.error('请先选择至少一个路径点')
      return
    }

    setShowExecuteOptions(prev => !prev)
  }

  const handleGoToSelectedWaypoints = async () => {
    if (selectedWaypoints.length === 0) {
      toast.error('请先选择至少一个路径点')
      return
    }

    if (!robotStatus || !EXECUTABLE_ROBOT_STATUSES.has(robotStatus)) {
      toast.error(`机器人当前状态为 ${robotStatus ?? '未知'}，只有 idle/succeeded/failed/canceled 时可以前往选中路径点`)
      return
    }

    const mapName = mapsNew.find(map => map.id === mapId)?.name
    if (!mapName) {
      toast.error('未找到当前地图名称，无法下发任务')
      return
    }

    const preciseXY = Number(executePreciseXY)
    const preciseRad = Number(executePreciseRad)
    if (!Number.isFinite(preciseXY) || preciseXY <= 0) {
      toast.error('请输入有效的坐标精度')
      return
    }
    if (!Number.isFinite(preciseRad) || preciseRad <= 0) {
      toast.error('请输入有效的朝向精度')
      return
    }

    const selectedAction = executeActionId
      ? pointActions.find(action => `${action.id}` === executeActionId)
      : undefined
    if (executeActionId && !selectedAction) {
      toast.error('请选择有效的行为')
      return
    }
    const executeActions = selectedAction ? [selectedAction] : []

    const orderedWaypoints = getSelectedWaypointsForNavigation()
    const loadingToast = toast.loading(`正在下发 ${orderedWaypoints.length} 个路径点...`)

    try {
      const response = await apiServer.executeWaypointTask({
        task_uid: createSelectedWaypointTaskUid(),
        is_repeat: false,
        wps: orderedWaypoints.map((point, index) => ({
          pose: {
            position: {
              x: point.x,
              y: -point.y,
            },
            orientation: canvasAngleToQuaternion(point.rotation),
          },
          is_dest: index === orderedWaypoints.length - 1,
          nav_type: executeNavType,
          actions: index === orderedWaypoints.length - 1 ? executeActions : [],
          precise_xy: preciseXY,
          precise_rad: preciseRad,
          is_reverse: false,
          inflation_radius: 1.1,
          map: mapName,
          uid: point.uid,
        })),
      })

      toast.dismiss(loadingToast)
      if (response.code === 0) {
        setShowExecuteOptions(false)
        toast.success('已下发选中路径点任务')
        return
      }

      toast.error(response.message || '下发选中路径点任务失败')
    }
    catch (error) {
      toast.dismiss(loadingToast)
      toast.error(`下发选中路径点任务失败 ${error}`)
    }
  }

  const wsOption = {
    shouldReconnect: (event: CloseEvent) => event.code !== 1000,
    reconnectAttempts: 100,
    reconnectInterval: 2000,
    retryOnError: true,
  }
  const { lastMessage: robotFsmMessage, readyState: robotState } = useWebSocket(apiServer.robotFsmWsUrl, wsOption)
  const { lastMessage: localizationQualityMessage } = useWebSocket(apiServer.localizationQualityWsUrl, wsOption)
  const { lastMessage: pathMessage } = useWebSocket(`${apiServer.wsDomain}/path_plan`, wsOption)

  useEffect(() => {
    if (robotFsmMessage !== null) {
      const status = parseRobotStatus(robotFsmMessage.data)
      if (status)
        updateRobotFsm(status)
      else
        console.error('Failed to parse robot FSM', robotFsmMessage.data)
    }

    if (localizationQualityMessage !== null) {
      const quality = parseFiniteNumber(localizationQualityMessage.data)
      if (quality != null)
        updateLocalizationQuality(quality)
      else
        console.error('Failed to parse localization quality', localizationQualityMessage.data)
    }

    if (pathMessage !== null) {
      try {
        const msg = JSON.parse(pathMessage.data) as { path: PointMessage[] }
        setPathPointInfo(msg.path)
      }
      catch (e) {
        console.error('Failed to parse path data', pathMessage.data, e)
      }
    }
  }, [localizationQualityMessage, pathMessage, robotFsmMessage, setPathPointInfo, updateLocalizationQuality, updateRobotFsm])

  const handleFetchClicked = async () => {
    try {
      const currentMap = await apiServer.fetchCurrentMap()
      const foundMap = mapsNew.find(map => map.id === currentMap.map_id)
      if (foundMap == null)
        return

      // 显示加载提示
      const loadingToast = toast.loading('正在加载地图数据...')

      const blob = await apiServer.downloadMap(foundMap.navigation_map_file_path)
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const mapRaster = await parseMapRaster(uint8Array)
      const mapInfo = mapRaster.width === foundMap.info.width && mapRaster.height === foundMap.info.height
        ? foundMap.info
        : {
            ...foundMap.info,
            width: mapRaster.width,
            height: mapRaster.height,
          }

      if (mapInfo !== foundMap.info) {
        console.warn(
          `Downloaded ${mapRaster.format.toUpperCase()} map size ${mapRaster.width}x${mapRaster.height} differs from metadata ${foundMap.info.width}x${foundMap.info.height}; using image size.`,
        )
      }

      // 获取部署配置
      const profiles = await apiServer.fetchMapDeployment(currentMap.map_id)

      // 更新状态（这会触发Redux DevTools的序列化，但我们已经添加了状态净化功能）
      setMapGrid(mapRaster.data, mapInfo)
      requestCenterRobot()
      addProfiles(profiles)

      // 关闭加载提示并显示成功消息
      toast.dismiss(loadingToast)
      toast.success('地图数据获取成功')
    }
    catch (error) {
      console.error('加载地图数据失败:', error)
      toast.error('加载地图数据失败')
    }
  }

  const handleSubmitClicked = async () => {
    // Submit task
    const profile = currentProfile()
    if (!profile)
      return

    const task = currentTask()
    if (task) {
      await apiServer.submitTask({
        deploy_id: profile.uid,
        uid: task.uid,
        data: task,
      })
    }

    // Submit profile
    const points = profile.data.waypoints
    const paths = profile.data.paths
    const doors = profile.data.doors ?? []
    const lifts = profile.data.lifts ?? []
    try {
      await submitDeploymentProfile({
        ...profile,
        map_id: mapId,
        data: {
          ...profile.data,
          waypoints: points,
          paths,
          doors,
          lifts,
        },
      })
      toast.success('保存成功')
    }
    catch (e) {
      toast.error(`保存失败 ${e}`)
    }
  }

  const handleGenerateRmfClicked = () => {
    setShowExportModal(true)
  }

  const handleRestartRmf = async () => {
    if (rmfRestartPending.current || isUploadingRmf)
      return
    const targetHost = rmfUploadHost.trim()
    // eslint-disable-next-line no-alert
    if (!window.confirm(`确定重启 ${targetHost} 上的 RMF？\nRMF 将重新加载已上传的导航图，车队任务和连接可能短暂中断。`))
      return

    rmfRestartPending.current = true
    setIsRestartingRmf(true)
    const loadingToast = toast.loading(`正在重启 ${targetHost} 上的 RMF...`)
    try {
      await apiServer.restartRmf(targetHost)
      toast.success('RMF 已重启，连接正在恢复', { id: loadingToast })
    }
    catch (error) {
      toast.error(`RMF 重启失败：${error instanceof Error ? error.message : String(error)}`, { id: loadingToast })
    }
    finally {
      rmfRestartPending.current = false
      setIsRestartingRmf(false)
    }
  }

  const handleForceRestartNavigation = async () => {
    // eslint-disable-next-line no-alert
    const confirmed = confirm('确定强制重启导航程序？当前运行中的导航将被中断。')
    if (!confirmed)
      return

    let readinessTimeout: ReturnType<typeof setTimeout>
    const waitForTransitionMonitoring = new Promise<boolean>((resolve) => {
      const finishWaiting = (ready: boolean) => {
        clearTimeout(readinessTimeout)
        if (navigationTransitionReadyRef.current === finishWaiting)
          navigationTransitionReadyRef.current = null
        resolve(ready)
      }
      navigationTransitionReadyRef.current = finishWaiting
      readinessTimeout = setTimeout(() => finishWaiting(false), 5000)
    })
    setNavigationRestartState('restarting')
    setShowNavigationTransitionEvents(true)
    const transitionMonitoringReady = await waitForTransitionMonitoring
    if (!transitionMonitoringReady) {
      setNavigationRestartState('failed')
      toast.error('生命周期事件监控连接失败，未执行导航重启')
      return
    }

    const loadingToast = toast.loading('正在强制重启导航...')

    try {
      const currentMap = await apiServer.fetchCurrentMap()
      if (currentMap.map_id !== mapId) {
        const changeMapResp = await apiServer.changeMap(mapId)
        if (changeMapResp.code !== 0)
          throw new Error(changeMapResp.message || '切换地图失败')
      }

      try {
        await apiServer.stopMapping()
      }
      catch {
        // Ignore stop errors here; force restart should continue to attempt a fresh navigation start.
      }

      await new Promise(resolve => setTimeout(resolve, 1000))

      const navigationResp = await apiServer.navigation(mapId, 'diff') as ApiResultLike
      if (navigationResp.code != null && navigationResp.code !== 0)
        throw new Error(navigationResp.message || '启动导航失败')

      toast.dismiss(loadingToast)
      setNavigationRestartState('succeeded')
      toast.success('导航程序已重启')
    }
    catch (error) {
      toast.dismiss(loadingToast)
      setNavigationRestartState('failed')
      toast.error(`重启导航失败 ${error}`)
    }
  }

  const handleExportRmf = async (selections: ExportRmfSelection[], targetHost: string, alignment: ExportRmfAlignment) => {
    if (selections.length === 0) {
      toast.error('请先选择至少一个地图和部署配置')
      return
    }

    const selectedLevels = selections.map(selection => ({
      selection,
      drawingFilename: `${sanitizeRmfFileName(selection.map.name)}.png`,
    }))
    const isVisualMapAlignment = alignment?.method === 'visual-map'
    const visualAlignmentLevelsByName = new Map(
      isVisualMapAlignment ? alignment.levels.map(level => [level.levelName, level]) : [],
    )
    const getSourceGridInfo = (selection: ExportRmfSelection) => {
      const alignmentLevel = visualAlignmentLevelsByName.get(selection.map.name)
      return createGridInfoWithImageDimensions(selection.map.info, {
        width: alignmentLevel?.imageWidth,
        height: alignmentLevel?.imageHeight,
      })
    }
    const alignedMapImageLayout = isVisualMapAlignment
      ? createAlignedMapImageLayout(selectedLevels.map(({ selection }) => {
        const alignmentLevel = visualAlignmentLevelsByName.get(selection.map.name)

        return {
          levelName: selection.map.name,
          width: alignmentLevel?.imageWidth ?? selection.map.info.width,
          height: alignmentLevel?.imageHeight ?? selection.map.info.height,
          transform: alignmentLevel?.imageTransform,
        }
      }))
      : null
    const alignedMapImageLayoutByLevel = new Map(
      alignedMapImageLayout?.levels.map(level => [level.levelName, level]) ?? [],
    )
    const currentMapName = mapsNew.find(map => map.id === mapId)?.name
    const buildingName = currentMapName ?? selections[0].map.name ?? 'map'
    const content = buildRmfBuildingYaml(
      selectedLevels.map(({ selection, drawingFilename }) => ({
        levelName: selection.map.name,
        drawingFilename,
        gridInfo: getSourceGridInfo(selection),
        pixelTransform: alignedMapImageLayoutByLevel.get(selection.map.name)?.pixelTransform,
        profile: selection.profile,
      })),
      {
        buildingName,
        alignment,
      },
    )

    const loadingToast = toast.loading('正在准备导航图文件...')
    let uploadToast: string | undefined
    let localUpdateToast: string | undefined
    setIsUploadingRmf(true)
    try {
      if (isVisualMapAlignment) {
        const missingAssetLevel = selectedLevels.find(({ selection }) => {
          const map = selection.map
          return !map.localization_map_file_path
            || !map.localization_map_yaml_file_path
            || !map.navigation_map_file_path
            || !map.navigation_map_yaml_file_path
        })
        if (missingAssetLevel)
          throw new Error(`${missingAssetLevel.selection.map.name} 缺少 localization 或 navigation 地图 PNG/YAML，无法覆盖本地地图文件`)
      }

      const referenceLevel = isVisualMapAlignment
        ? selectedLevels.find(({ selection }) => selection.map.name === alignment.referenceLevelName)
        : undefined
      const referenceYaml = referenceLevel
        ? await (await apiServer.downloadMap(referenceLevel.selection.map.navigation_map_yaml_file_path)).text()
        : ''

      const mapImages = await Promise.all(selectedLevels.map(async ({ selection, drawingFilename }): Promise<PreparedRmfMapImage> => {
        const mapPath = selection.map.navigation_map_file_path || selection.map.localization_map_file_path
        if (!mapPath)
          throw new Error(`${selection.map.name} 缺少地图图片路径`)

        const alignedLevelLayout = alignedMapImageLayoutByLevel.get(selection.map.name)

        if (isVisualMapAlignment && alignedMapImageLayout && alignedLevelLayout) {
          const navigationBlob = await apiServer.downloadMap(selection.map.navigation_map_file_path)
          const navigationData = await navigationBlob.arrayBuffer()
          const renderOptions = {
            width: alignedMapImageLayout.width,
            height: alignedMapImageLayout.height,
            sourceWidth: alignedLevelLayout.width,
            sourceHeight: alignedLevelLayout.height,
            pixelTransform: alignedLevelLayout.pixelTransform,
          }
          const navigationPng = await renderAlignedMapRasterToPngBlob(new Uint8Array(navigationData), renderOptions)
          // Operators align the navigation image. Legacy localization images can have
          // a different source frame, so persist the aligned visual frame to both slots.
          const localizationPng = navigationPng
          const resolution = resolveAlignedNav2MapResolution(
            referenceYaml,
            referenceLevel?.selection.map.info.resolution ?? selection.map.info.resolution,
          )
          const alignedGridInfo = createAlignedGridInfo(alignedMapImageLayout.width, alignedMapImageLayout.height, resolution)
          const updatedProfile = transformNavProfileToAlignedMapFrame(
            selection.profile,
            getSourceGridInfo(selection),
            alignedGridInfo,
            alignedLevelLayout.pixelTransform,
          )
          const yamlContent = buildAlignedNav2MapYaml({
            referenceYaml,
            imageFilename: `${selection.map.name}.png`,
            imageHeight: alignedMapImageLayout.height,
            fallbackResolution: resolution,
          })
          const localizationYaml = new Blob([yamlContent], { type: 'application/x-yaml;charset=utf-8' })
          const navigationYaml = new Blob([yamlContent], { type: 'application/x-yaml;charset=utf-8' })

          return {
            filename: drawingFilename,
            blob: navigationPng,
            updatedProfile,
            localUpdate: {
              mapName: selection.map.name,
              localizationPng,
              localizationYaml,
              navigationPng,
              navigationYaml,
            },
          }
        }

        const blob = await apiServer.downloadMap(mapPath)
        const data = new Uint8Array(await blob.arrayBuffer())

        return {
          filename: drawingFilename,
          blob: alignedMapImageLayout && alignedLevelLayout
            ? await renderAlignedMapRasterToPngBlob(data, {
              width: alignedMapImageLayout.width,
              height: alignedMapImageLayout.height,
              sourceWidth: alignedLevelLayout.width,
              sourceHeight: alignedLevelLayout.height,
              pixelTransform: alignedLevelLayout.pixelTransform,
            })
            : await convertMapRasterToPngBlob(data),
        }
      }))

      if (isVisualMapAlignment) {
        localUpdateToast = toast.loading('正在更新本地地图文件...')
        await Promise.all(mapImages.map((image) => {
          if (!image.localUpdate)
            throw new Error(`${image.filename} 缺少本地地图更新文件`)

          return apiServer.updateSavedMapFiles(image.localUpdate.mapName, {
            localizationPng: image.localUpdate.localizationPng,
            localizationYaml: image.localUpdate.localizationYaml,
            navigationPng: image.localUpdate.navigationPng,
            navigationYaml: image.localUpdate.navigationYaml,
          })
        }))
        const updatedProfiles = mapImages.map((image) => {
          if (!image.updatedProfile)
            throw new Error(`${image.filename} 缺少部署配置更新文件`)

          return image.updatedProfile
        })
        await Promise.all(updatedProfiles.map(submitDeploymentProfile))
        addProfiles(updatedProfiles)
        const nextMaps = await apiServer.fetchMapListNew()
        setMapsNew(nextMaps)
        toast.dismiss(localUpdateToast)
        localUpdateToast = undefined
      }

      toast.dismiss(loadingToast)
      uploadToast = toast.loading('正在上传导航图...')
      const response = await apiServer.uploadRmfBuildingYaml(targetHost, content, mapImages)
      if (!response.ok || response.returncode !== 0)
        throw new Error(response.stderr || response.stdout || `returncode=${response.returncode}`)
      setRmfUploadHost(targetHost.trim())
      toast.dismiss(uploadToast)
      uploadToast = undefined

      setShowExportModal(false)
      toast.success('导航图已上传并生成，点击“重启 RMF”加载')
    }
    catch (error) {
      toast.dismiss(loadingToast)
      if (uploadToast)
        toast.dismiss(uploadToast)
      if (localUpdateToast)
        toast.dismiss(localUpdateToast)
      toast.error(`上传导航图失败 ${error}`)
    }
    finally {
      setIsUploadingRmf(false)
    }
  }

  useKeyPress((event, isDown) => {
    if (isDown) {
      if (event.ctrlKey)
        handleSubmitClicked()
    }
  }, ['s', 'S'])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    event.preventDefault()
    setToolCategory(null)
    setShowExecuteOptions(false)
    activateSelectMode()
  }, ['Escape'])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    event.preventDefault()
    activatePathMode()
  }, ['l', 'L'])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    event.preventDefault()
    activateManualWaypointPlacement()
  }, ['v', 'V'])

  useKeyPress((event, isDown) => {
    if (!isDown || isEditableTarget(event.target))
      return

    event.preventDefault()
    activateMoveMode()
  }, ['m', 'M'])

  useEffect(() => {
    return () => {
      cancelRelocalization()
      updateOp('move')
    }
  }, [cancelRelocalization, updateOp])

  useEffect(() => {
    if (!toolCategory)
      return
    const dismiss = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setToolCategory(null)
        setShowExecuteOptions(false)
      }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [toolCategory])

  const selectedLineWaypoints = getSelectedLineWaypoints()
  const selectedLineWaypointCount = selectedLineWaypoints.length

  return (
    <div className="robot-toolbar" ref={toolbarRef}>
      <div className="robot-toolbar-header">
        <div className="robot-toolbar-heading">
          <strong title="当前地图">{mapsNew.find(map => map.id === mapId)?.name || '当前地图'}</strong>
          <span className={`robot-toolbar-connection${robotState === ReadyState.OPEN ? ' is-connected' : ''}`} title={robotState === ReadyState.OPEN ? `机器人已连接：${robotStatus || '等待状态'}` : '机器人未连接'} aria-label={robotState === ReadyState.OPEN ? '机器人已连接' : '机器人未连接'} />
        </div>
        <div className="robot-toolbar-menus" role="group" aria-label="工具分类">
          {([
            ['edit', '编辑'],
            ['points', '路径点'],
            ['robot', '机器人'],
            ['view', '视图'],
          ] as const).map(([category, label]) => (
            <button
              key={category}
              type="button"
              className="robot-toolbar-menu-button"
              aria-expanded={toolCategory === category}
              aria-controls="robot-tool-menu"
              onClick={() => {
                setToolCategory(current => current === category ? null : category)
                setShowExecuteOptions(false)
              }}>
              {label}
            </button>
          ))}
        </div>
        <div className="robot-toolbar-actions" role="group" aria-label="保存与部署">
          <RobotToolButton label="保存" icon="i-material-symbols-save-rounded" onClick={handleSubmitClicked} disabled={!currentProfile()} tone="primary" title="保存当前地图配置 (Ctrl+S)" />
          <RobotToolButton label={isUploadingRmf ? '上传中…' : '上传导航图'} icon="i-material-symbols-upload-rounded" onClick={handleGenerateRmfClicked} busy={isUploadingRmf} disabled={isRestartingRmf} tone="upload" />
          <RobotToolButton label={isRestartingRmf ? 'RMF 重启中…' : '重启 RMF'} icon="i-material-symbols-restart-alt-rounded" onClick={handleRestartRmf} busy={isRestartingRmf} disabled={isUploadingRmf} tone="warning" title={`重启 ${rmfUploadHost} 上的 RMF，加载已上传的导航图`} />
        </div>
      </div>
      {toolCategory && (
        <div
          id="robot-tool-menu"
          className="robot-toolbar-tools"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setToolCategory(null)
              setShowExecuteOptions(false)
            }
          }}
          onClick={(event) => {
            if ((toolCategory === 'edit' || toolCategory === 'points') && (event.target as Element).closest('button'))
              setToolCategory(null)
          }}>
          <button type="button" className="robot-tool-menu-close" aria-label="关闭工具菜单" onClick={() => setToolCategory(null)}>×</button>
          {toolCategory === 'edit' && (
            <>
              <RobotToolGroup label="配置">
                <RobotToolButton label="读取配置" icon="i-material-symbols-download-rounded" onClick={handleFetchClicked} title="从机器人读取当前地图与配置" />
              </RobotToolGroup>
              <RobotToolGroup label="浏览">
                <RobotToolButton label="拖动" icon="i-material-symbols-back-hand-outline-rounded" active={currentOp === 'move'} onClick={activateMoveMode} title="拖动视图 (M)" />
                <RobotToolButton label="选择" icon="i-material-symbols-near-me-outline-rounded" active={currentOp === 'select'} onClick={activateSelectMode} title="选择路径点 (Esc)" />
              </RobotToolGroup>
              <RobotToolGroup label="路径点">
                <RobotToolButton label="记录机器人位置" icon="i-material-symbols-add-location-outline" onClick={captureRobotWaypoint} disabled={!robotInfo || !hasLivePose} />
                <RobotToolButton label="手动放置" icon="i-material-symbols-my-location-outline-rounded" active={currentOp === 'waypoint'} onClick={activateManualWaypointPlacement} title="手动放置路径点 (V)" />
                <RobotToolButton label="等距布点" icon="i-material-symbols-linear-scale" active={currentOp === 'waypointLine'} onClick={activateLineWaypointPlacement} />
                <RobotToolButton label="对接起点" icon="i-material-symbols-ev-station-outline-rounded" onClick={createDockingStartWaypoint} busy={isCalculatingDockingPose} disabled={!robotInfo || !hasLivePose} title="从机器人当前位姿创建对接起点" />
              </RobotToolGroup>
              <RobotToolGroup label="通行设施">
                <RobotToolButton label="画车道" icon="i-material-symbols-edit-road-outline-rounded" active={currentOp === 'pathway'} onClick={activatePathMode} title="添加车道 (L)" />
                <RobotToolButton label="自动生成车道" icon="i-material-symbols-auto-fix-normal-rounded" onClick={openLaneGeneration} />
                <RobotToolButton label="门" icon="i-material-symbols-door-front-outline-rounded" active={currentOp === 'door'} onClick={activateDoorMode} />
                <RobotToolButton label="电梯" icon="i-material-symbols-elevator-outline-rounded" active={currentOp === 'lift'} onClick={activateLiftMode} />
              </RobotToolGroup>
            </>
          )}
          {toolCategory === 'points' && (
            <RobotToolGroup label={`已选 ${selectedPointIds.length} 个路径点`}>
              <RobotToolButton label="选择整线" icon="i-material-symbols-select-all-rounded" onClick={selectCurrentWaypointLine} disabled={selectedLineWaypointCount < 2} />
              <RobotToolButton label="旋转整线" icon="i-material-symbols-rotate-right-rounded" onClick={openRotateLineModal} disabled={selectedLineWaypointCount < 2} />
              <RobotToolButton label="等距重排" icon="i-material-symbols-align-horizontal-center-rounded" onClick={openRedistributeModal} disabled={selectedPointIds.length < 2} title="等距重排 (/)" />
              <RobotToolButton label="批量重命名" icon="i-material-symbols-edit-note-rounded" onClick={openBatchRenameModal} disabled={selectedPointIds.length < 2} />
            </RobotToolGroup>
          )}
          {toolCategory === 'robot' && (
            <>
              <RobotToolGroup label="控制">
                <div className="relative">
                  <RobotToolButton label="前往选中点" icon="i-material-symbols-play-arrow-rounded" onClick={toggleExecuteWaypointOptions} disabled={!selectedWaypoints.length} />
                  {showExecuteOptions && (
                    <div
                      className="absolute z-50 top-11 left-0 w-56 rounded-xl border-(solid 1px gray-300) bg-white p-3 text-sm text-gray-800 shadow-lg"
                      onClick={event => event.stopPropagation()}>
                      <div className="mb-1 font-bold">前往选中点</div>
                      <div className="mb-3 text-xs text-gray-500">确认后下发 {selectedWaypoints.length} 个路径点</div>
                      <label className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-gray-600">导航方式</span>
                        <select
                          className="w-26 rounded border-(solid 1px gray-300) bg-gray-50 px-2 py-1"
                          value={executeNavType}
                          onChange={event => setExecuteNavType(event.target.value as ExecuteWaypointNavType)}>
                          <option value="auto">auto</option>
                          <option value="manually">manually</option>
                        </select>
                      </label>
                      <label className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-gray-600">终点行为</span>
                        <select
                          className="w-26 rounded border-(solid 1px gray-300) bg-gray-50 px-2 py-1"
                          value={executeActionId}
                          onChange={event => setExecuteActionId(event.target.value)}>
                          <option value="">无</option>
                          {pointActions.map(action => (
                            <option key={action.id} value={action.id}>{action.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-gray-600">坐标精度</span>
                        <input
                          className="w-26 rounded border-(solid 1px gray-300) bg-gray-50 px-2 py-1 text-right"
                          inputMode="decimal"
                          value={executePreciseXY}
                          onChange={event => setExecutePreciseXY(event.target.value)} />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-gray-600">朝向精度</span>
                        <input
                          className="w-26 rounded border-(solid 1px gray-300) bg-gray-50 px-2 py-1 text-right"
                          inputMode="decimal"
                          value={executePreciseRad}
                          onChange={event => setExecutePreciseRad(event.target.value)} />
                      </label>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-md border-(solid 1px gray-300) px-3 py-1 text-gray-600 hover:bg-gray-100"
                          onClick={() => setShowExecuteOptions(false)}>
                          取消
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-green-600 px-3 py-1 text-white hover:bg-green-700"
                          onClick={handleGoToSelectedWaypoints}>
                          确认前往
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <RobotToolButton label={currentOp === 'relocalize' ? '取消重定位' : '重定位'} icon="i-material-symbols-location-on-outline" active={currentOp === 'relocalize'} onClick={toggleRelocalization} />
                  {currentOp === 'relocalize' && (
                    <div className="absolute z-50 top-11 left-0 w-56 rounded-xl border-(solid 1px gray-300) bg-white p-3 text-sm text-gray-800 shadow-lg">
                      <div className="mb-2 font-bold">重定位设置</div>
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-gray-600">use_absolute</span>
                        <select
                          className="w-26 rounded border-(solid 1px gray-300) bg-gray-50 px-2 py-1"
                          value={relocalizationUseAbsolute ? 'true' : 'false'}
                          onChange={event => setRelocalizationUseAbsolute(event.target.value === 'true')}>
                          <option value="false">false</option>
                          <option value="true">true</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
                {currentOp === 'relocalize' && <RobotToolButton label="发送重定位" icon="i-material-symbols-check-circle-outline-rounded" onClick={handleRelocalizationConfirm} tone="primary" />}
                <RobotToolButton label="外设状态" icon="i-material-symbols-inventory-2-outline-rounded" onClick={() => setShowShelfStateModal(true)} />
              </RobotToolGroup>
              <RobotToolGroup label="维护">
                <RobotToolButton label="重启机器人导航" icon="i-material-symbols-refresh-rounded" onClick={handleForceRestartNavigation} disabled={isRestartingRmf || isUploadingRmf || (showNavigationTransitionEvents && navigationRestartState === 'restarting')} tone="warning" title="强制重启当前机器人的导航程序" />
              </RobotToolGroup>
            </>
          )}
          {toolCategory === 'view' && (
            <>
              <RobotToolGroup label="地图">
                <RobotToolButton label="放大" icon="i-material-symbols-zoom-in-rounded" onClick={zoomInClick} />
                <RobotToolButton label="缩小" icon="i-material-symbols-zoom-out-rounded" onClick={zoomOutClick} />
                <RobotToolButton label="地图居中" icon="i-material-symbols-center-focus-strong-rounded" onClick={centerMapOnCanvas} />
                <RobotToolButton label="机器人居中" icon="i-material-symbols-my-location-rounded" onClick={centerRobotOnCanvas} />
              </RobotToolGroup>
              <RobotToolGroup label="激光扫描">
                <RobotToolButton label={isScanVisible ? '隐藏扫描' : '显示扫描'} icon="i-material-symbols-sensors-rounded" active={isScanVisible} onClick={toggleScanVisibility} />
                {isScanVisible && (
                  <>
                    <LidarScanControls />
                    <RobotToolButton label="减小点" icon="i-material-symbols-remove-rounded" onClick={decreaseScanPointSize} />
                    <RobotToolButton label="增大点" icon="i-material-symbols-add-rounded" onClick={increaseScanPointSize} />
                  </>
                )}
              </RobotToolGroup>
              <RobotToolGroup label="代价地图"><CostmapControls /></RobotToolGroup>
              <RobotToolGroup label="点云与相机"><PointCloudControls /><CameraStreamControls /></RobotToolGroup>
            </>
          )}
        </div>
      )}
      {showExportModal && (
        <ExportRmfModal
          currentMapId={mapId}
          currentProfileUid={currentProfile()?.uid}
          defaultUploadHost={rmfUploadHost}
          isSubmitting={isUploadingRmf}
          onClose={() => setShowExportModal(false)}
          onConfirm={handleExportRmf} />
      )}
      {showShelfStateModal && (
        <ShelfStateModal onClose={() => setShowShelfStateModal(false)} />
      )}
      {showNavigationTransitionEvents && (
        <NavigationTransitionEventsModal
          host={nestControllerIp}
          restartState={navigationRestartState}
          onReady={handleNavigationTransitionReady}
          onClose={() => setShowNavigationTransitionEvents(false)} />
      )}
      {showBatchRenameModal && (
        <BatchRenameWaypointsModal
          points={selectedWaypoints}
          onClose={() => setShowBatchRenameModal(false)}
          onConfirm={handleBatchRenameWaypoints} />
      )}
      {laneGeneration && (
        <GenerateLanesModal
          mapId={mapId}
          points={laneGeneration.points}
          existingPaths={currentProfile()?.data.paths ?? []}
          onClose={() => setLaneGeneration(null)}
          onApply={applyGeneratedLanes} />
      )}
      {showRedistributeModal && (
        <RedistributeWaypointsModal
          points={selectedWaypoints}
          defaultSpacing={selectedWaypointRedistributionSpacing}
          onClose={() => setShowRedistributeModal(false)}
          onConfirm={spacing => applyRedistributedWaypoints(spacing)} />
      )}
      {showRotateLineModal && (
        <RotateLineWaypointsModal
          points={selectedLineWaypoints}
          onClose={() => setShowRotateLineModal(false)}
          onConfirm={handleRotateLineWaypoints} />
      )}
    </div>
  )
}

export default TopDeck
