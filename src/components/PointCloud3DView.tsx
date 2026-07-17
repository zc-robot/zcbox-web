import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import toast from 'react-hot-toast'
import apiServer from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'
import { defaultPointCloudTopics } from '@/store/params'
import type { PointCloudMessage, PointCloudPoint } from '@/types'

const topicColors = [
  '#38bdf8',
  '#22c55e',
  '#f97316',
  '#a78bfa',
  '#f43f5e',
  '#eab308',
  '#14b8a6',
  '#fb7185',
]

const defaultPointCloudRoiRequest: ZenohPointCloudRoiRequest = {
  min_x: 0,
  max_x: 3,
  min_y: -0.5,
  max_y: 0.5,
  min_z: -0.2,
  max_z: 1,
  remove_ground: false,
  ground_plane_a: 0,
  ground_plane_b: 0,
  ground_plane_c: 1,
  ground_plane_d: 0,
  ground_distance_threshold: 0.06,
}

type PointCloudRoiNumberKey = Exclude<keyof ZenohPointCloudRoiRequest, 'remove_ground'>

const roiBoundsFields: Array<{ key: keyof Pick<ZenohPointCloudRoiRequest, 'min_x' | 'max_x' | 'min_y' | 'max_y' | 'min_z' | 'max_z'>; label: string }> = [
  { key: 'min_x', label: 'X 最小' },
  { key: 'max_x', label: 'X 最大' },
  { key: 'min_y', label: 'Y 最小' },
  { key: 'max_y', label: 'Y 最大' },
  { key: 'min_z', label: 'Z 最小' },
  { key: 'max_z', label: 'Z 最大' },
]

const roiGroundPlaneFields: Array<{ key: keyof Pick<ZenohPointCloudRoiRequest, 'ground_plane_a' | 'ground_plane_b' | 'ground_plane_c' | 'ground_plane_d'>; label: string }> = [
  { key: 'ground_plane_a', label: 'A' },
  { key: 'ground_plane_b', label: 'B' },
  { key: 'ground_plane_c', label: 'C' },
  { key: 'ground_plane_d', label: 'D' },
]

const pointCloudRoiCameras = [
  { name: 'camera_1', label: '相机 1' },
  { name: 'camera_2', label: '相机 2' },
]

interface PointCloudRoiStatus {
  type: 'success' | 'error'
  cameraName: string
  serviceKey?: string
  message: string
  frameId?: string
  pointCount?: number
  sampledCount?: number
  isTransformError?: boolean
}

function parseTopicDraft(value: string) {
  return value
    .split(/[,\n]+/)
    .map(topic => topic.trim())
    .filter(Boolean)
}

function formatTopics(topics: string[]) {
  return topics.join('\n')
}

function normalizeFrameId(frameId: string) {
  return frameId.replace(/^\/+/, '').toLowerCase()
}

function isOpticalFrame(frameId: string) {
  const normalized = normalizeFrameId(frameId)
  return normalized.includes('optical')
    || normalized.includes('camera')
    || normalized.includes('depth')
}

function getCloudTopic(pointCloud: PointCloudMessage) {
  return pointCloud.topic || pointCloud.key || pointCloud.frameId
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error))
    return String(error)

  return error.message
    .replace(/^Error invoking remote method 'zenoh-command:get-point-cloud-roi':\s*/, '')
    .replace(/^Error:\s*/, '')
}

function formatPointCloudRoiError(message: string) {
  const transformMatch = message.match(/Failed to transform point cloud from\s+(.+?)\s+to\s+(.+)$/i)
  if (!transformMatch)
    return message

  return `服务端 TF 转换失败：${transformMatch[1]} -> ${transformMatch[2]}`
}

function getThreePoint(point: PointCloudPoint, frameId: string) {
  if (isOpticalFrame(frameId)) {
    return {
      x: point[2],
      y: -point[1],
      z: -point[0],
    }
  }

  return {
    x: point[0],
    y: point[2],
    z: point[1],
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildPointCloudGeometry(cloud: PointCloudMessage, color: THREE.Color) {
  const positions = new Float32Array(cloud.points.length * 3)
  const colors = new Float32Array(cloud.points.length * 3)
  const highColor = new THREE.Color('#f97316')

  cloud.points.forEach((point, index) => {
    const threePoint = getThreePoint(point, cloud.frameId)
    positions[index * 3] = threePoint.x
    positions[index * 3 + 1] = threePoint.y
    positions[index * 3 + 2] = threePoint.z

    const heightWeight = clamp((threePoint.y + 0.3) / 1.8, 0, 1)
    const pointColor = color.clone().lerp(highColor, heightWeight * 0.45)
    colors[index * 3] = pointColor.r
    colors[index * 3 + 1] = pointColor.g
    colors[index * 3 + 2] = pointColor.b
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

const PointCloud3DView: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cloudGroupRef = useRef<THREE.Group | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const hasFittedCloudRef = useRef(false)
  const [rendererReady, setRendererReady] = useState(false)
  const pointClouds = useGridStore(state => state.pointClouds)
  const pointCloudPointSize = useGridStore(state => state.pointCloudPointSize)
  const setPointCloudVisibility = useGridStore(state => state.setPointCloudVisibility)
  const updatePointCloud = useGridStore(state => state.updatePointCloud)
  const updatePointCloudPointSize = useGridStore(state => state.updatePointCloudPointSize)
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const pointCloudTopics = useParamsStore(state => state.pointCloudTopics)
  const updatePointCloudTopics = useParamsStore(state => state.updatePointCloudTopics)
  const [draftTopics, setDraftTopics] = useState(formatTopics(pointCloudTopics))
  const [pointCloudRoiRequest, setPointCloudRoiRequest] = useState<ZenohPointCloudRoiRequest>({ ...defaultPointCloudRoiRequest })
  const [requestingCamera, setRequestingCamera] = useState<string | null>(null)
  const [pointCloudRoiStatus, setPointCloudRoiStatus] = useState<PointCloudRoiStatus | null>(null)

  const totalPoints = useMemo(() => {
    return pointClouds.reduce((sum, cloud) => sum + cloud.points.length, 0)
  }, [pointClouds])
  const topicSummaries = useMemo(() => {
    return pointClouds.map((cloud, index) => ({
      color: topicColors[index % topicColors.length],
      frameId: cloud.frameId,
      originalFrameId: cloud.originalFrameId,
      points: cloud.points.length,
      topic: getCloudTopic(cloud),
      transformApplied: cloud.transformApplied,
    }))
  }, [pointClouds])

  const fitCameraToClouds = useCallback(() => {
    const group = cloudGroupRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!group || !camera || !controls)
      return

    const box = new THREE.Box3().setFromObject(group)
    if (box.isEmpty()) {
      camera.position.set(4, 3, 4)
      controls.target.set(0, 0, 0)
      controls.update()
      return
    }

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxSize = Math.max(size.x, size.y, size.z, 1)
    const distance = maxSize / (2 * Math.tan((camera.fov * Math.PI / 180) / 2))

    camera.position.set(
      center.x + distance * 0.95,
      center.y + distance * 0.72,
      center.z + distance * 0.95,
    )
    camera.near = Math.max(distance / 200, 0.01)
    camera.far = Math.max(distance * 10, 100)
    camera.updateProjectionMatrix()
    controls.target.copy(center)
    controls.update()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#020617')
    const camera = new THREE.PerspectiveCamera(58, 1, 0.01, 300)
    camera.position.set(4, 3, 4)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x020617, 1)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0, 0)

    const grid = new THREE.GridHelper(20, 40, '#475569', '#1e293b')
    grid.position.y = 0
    scene.add(grid)
    scene.add(new THREE.AxesHelper(1.2))

    const cloudGroup = new THREE.Group()
    scene.add(cloudGroup)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    cloudGroupRef.current = cloudGroup

    const resize = () => {
      const { clientWidth, clientHeight } = container
      const nextWidth = Math.max(1, clientWidth)
      const nextHeight = Math.max(1, clientHeight)
      renderer.setSize(nextWidth, nextHeight, false)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      animationFrameRef.current = window.requestAnimationFrame(render)
    }
    render()
    setRendererReady(true)

    return () => {
      setRendererReady(false)
      if (animationFrameRef.current != null)
        window.cancelAnimationFrame(animationFrameRef.current)
      resizeObserver.disconnect()
      controls.dispose()
      cloudGroup.traverse((object) => {
        if (object instanceof THREE.Points) {
          object.geometry.dispose()
          if (object.material instanceof THREE.Material)
            object.material.dispose()
        }
      })
      scene.clear()
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      cloudGroupRef.current = null
      animationFrameRef.current = null
      hasFittedCloudRef.current = false
    }
  }, [])

  useEffect(() => {
    const cloudGroup = cloudGroupRef.current
    if (!cloudGroup || !rendererReady)
      return

    while (cloudGroup.children.length > 0) {
      const child = cloudGroup.children[0]
      cloudGroup.remove(child)
      if (child instanceof THREE.Points) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material)
          child.material.dispose()
      }
    }

    pointClouds.forEach((cloud, index) => {
      const color = new THREE.Color(topicColors[index % topicColors.length])
      const geometry = buildPointCloudGeometry(cloud, color)
      const material = new THREE.PointsMaterial({
        size: pointCloudPointSize,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.94,
        vertexColors: true,
      })
      const points = new THREE.Points(geometry, material)
      cloudGroup.add(points)
    })

    if (pointClouds.length > 0 && totalPoints > 0 && !hasFittedCloudRef.current) {
      hasFittedCloudRef.current = true
      fitCameraToClouds()
    }
  }, [fitCameraToClouds, pointCloudPointSize, pointClouds, rendererReady, totalPoints])

  useEffect(() => {
    setDraftTopics(formatTopics(pointCloudTopics))
  }, [pointCloudTopics])

  const closeView = () => setPointCloudVisibility(false)
  const decreasePointSize = () => updatePointCloudPointSize(-0.01)
  const increasePointSize = () => updatePointCloudPointSize(0.01)
  const applyTopics = () => updatePointCloudTopics(parseTopicDraft(draftTopics))
  const resetTopics = () => updatePointCloudTopics(defaultPointCloudTopics)
  const updatePointCloudRoiNumber = (key: PointCloudRoiNumberKey, value: number) => {
    if (!Number.isFinite(value))
      return

    setPointCloudRoiRequest(current => ({
      ...current,
      [key]: value,
    }))
  }
  const resetPointCloudRoiRequest = () => setPointCloudRoiRequest({ ...defaultPointCloudRoiRequest })
  const requestPointCloudRoi = async (cameraName: string) => {
    if (!window.zcDesktop?.getZenohPointCloudRoi) {
      toast.error('点云 ROI 仅支持桌面应用')
      return
    }

    if (!nestControllerIp) {
      toast.error('未连接机器人控制器')
      return
    }

    setRequestingCamera(cameraName)
    setPointCloudRoiStatus(null)
    let serviceKey = ''
    try {
      const namespace = await apiServer.fetchZenohNamespace()
      const normalizedNamespace = namespace.replace(/^\/+/, '').replace(/\/+$/, '')
      serviceKey = normalizedNamespace
        ? `${normalizedNamespace}/${cameraName}/get_point_cloud_roi`
        : `${cameraName}/get_point_cloud_roi`
      const response = await window.zcDesktop.getZenohPointCloudRoi({
        host: nestControllerIp,
        namespace,
        cameraName,
        request: pointCloudRoiRequest,
        timeoutMs: 10000,
        maxPoints: 12000,
      })

      hasFittedCloudRef.current = false
      updatePointCloud(response.pointCloud)
      setPointCloudRoiStatus({
        type: 'success',
        cameraName,
        serviceKey: response.key || serviceKey,
        message: response.message || 'success',
        frameId: response.pointCloud.frameId,
        pointCount: response.pointCloud.pointCount,
        sampledCount: response.pointCloud.sampledCount,
      })
      toast.success(`点云已获取 ${response.pointCloud.sampledCount} 点`)
    }
    catch (error) {
      const message = getErrorMessage(error)
      const isTransformError = /Failed to transform point cloud from\s+.+?\s+to\s+.+$/i.test(message)
      const displayMessage = formatPointCloudRoiError(message)
      setPointCloudRoiStatus({
        type: 'error',
        cameraName,
        serviceKey,
        message: displayMessage,
        isTransformError,
      })
      toast.error(`获取点云失败 ${displayMessage}`)
    }
    finally {
      setRequestingCamera(null)
    }
  }

  return (
    <div className="fixed inset-0 z-80 flex bg-slate-950 text-white">
      <aside className="w-21rem shrink-0 overflow-y-auto border-(r-solid 1px slate-800) bg-slate-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-600">
            <div className="i-material-symbols-view-in-ar-outline-rounded text-5 text-sky-300" />
            <span>点云 3D</span>
          </div>
          <button
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-800"
            type="button"
            aria-label="关闭点云 3D"
            onClick={closeView}>
            <div className="i-material-symbols-close-rounded text-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="border-(solid 1px slate-700) bg-slate-800 p-2">
            <div className="text-slate-400">Topic</div>
            <div className="font-600">{pointClouds.length}</div>
          </div>
          <div className="border-(solid 1px slate-700) bg-slate-800 p-2">
            <div className="text-slate-400">点数</div>
            <div className="font-600">{totalPoints}</div>
          </div>
          <div className="border-(solid 1px slate-700) bg-slate-800 p-2">
            <div className="text-slate-400">原点</div>
            <div className="truncate font-600">base_footprint</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs text-slate-300">服务点云</div>
          <div className="grid grid-cols-2 gap-2">
            {pointCloudRoiCameras.map(camera => (
              <button
                key={camera.name}
                className="h-9 flex items-center justify-center gap-1 rounded bg-sky-600 px-2 text-sm text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                title={`调用 ${camera.name} 点云 ROI 服务`}
                aria-label={`调用 ${camera.name} 点云 ROI 服务`}
                disabled={requestingCamera !== null}
                onClick={() => void requestPointCloudRoi(camera.name)}>
                <div className={requestingCamera === camera.name ? 'i-material-symbols-refresh-rounded animate-spin text-4' : 'i-material-symbols-view-in-ar-outline-rounded text-4'} />
                <span>{requestingCamera === camera.name ? '获取中' : camera.label}</span>
              </button>
            ))}
          </div>
          {pointCloudRoiStatus && (
            <div
              className="mt-2 border-(solid 1px slate-800) bg-slate-950 p-2 text-xs"
              style={{ borderColor: pointCloudRoiStatus.type === 'success' ? '#065f46' : '#b45309' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-slate-300">{pointCloudRoiStatus.cameraName}</span>
                <span className={pointCloudRoiStatus.type === 'success' ? 'text-emerald-300' : 'text-amber-300'}>
                  {pointCloudRoiStatus.type === 'success' ? '成功' : '失败'}
                </span>
              </div>
              {pointCloudRoiStatus.serviceKey && (
                <div className="mt-1 truncate font-mono text-slate-500" title={pointCloudRoiStatus.serviceKey}>
                  {pointCloudRoiStatus.serviceKey}
                </div>
              )}
              <div className={`mt-1 break-words ${pointCloudRoiStatus.type === 'success' ? 'text-slate-300' : 'text-amber-200'}`}>
                {pointCloudRoiStatus.message}
              </div>
              {pointCloudRoiStatus.type === 'success' && (
                <div className="mt-1 flex justify-between gap-2 text-slate-400">
                  <span className="truncate">{pointCloudRoiStatus.frameId || 'base_footprint'}</span>
                  <span>{pointCloudRoiStatus.sampledCount} / {pointCloudRoiStatus.pointCount}</span>
                </div>
              )}
              {pointCloudRoiStatus.isTransformError && (
                <div className="mt-1 text-amber-300">
                  机器人 TF 缺少相机到 base_footprint 的转换
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 border-(solid 1px slate-800) bg-slate-950 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-300">服务请求</div>
            <button
              className="rounded border-(solid 1px slate-700) px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-800"
              type="button"
              disabled={requestingCamera !== null}
              onClick={resetPointCloudRoiRequest}>
              默认
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {roiBoundsFields.map(field => (
              <label key={field.key} className="block min-w-0 text-xs text-slate-400">
                <span className="mb-1 block">{field.label}</span>
                <input
                  className="h-8 w-full border-(solid 1px slate-700) rounded bg-slate-900 px-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-400 disabled:opacity-45"
                  type="number"
                  step="0.05"
                  disabled={requestingCamera !== null}
                  value={pointCloudRoiRequest[field.key]}
                  onChange={event => updatePointCloudRoiNumber(field.key, event.currentTarget.valueAsNumber)} />
              </label>
            ))}
          </div>

          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              disabled={requestingCamera !== null}
              checked={pointCloudRoiRequest.remove_ground}
              onChange={event => setPointCloudRoiRequest(current => ({
                ...current,
                remove_ground: event.target.checked,
              }))} />
            <span>去除地面</span>
          </label>

          <div className="mt-2 grid grid-cols-4 gap-2">
            {roiGroundPlaneFields.map(field => (
              <label key={field.key} className="block min-w-0 text-xs text-slate-400">
                <span className="mb-1 block">{field.label}</span>
                <input
                  className="h-8 w-full border-(solid 1px slate-700) rounded bg-slate-900 px-1.5 font-mono text-xs text-slate-100 outline-none focus:border-sky-400 disabled:opacity-45"
                  type="number"
                  step="0.01"
                  disabled={requestingCamera !== null}
                  value={pointCloudRoiRequest[field.key]}
                  onChange={event => updatePointCloudRoiNumber(field.key, event.currentTarget.valueAsNumber)} />
              </label>
            ))}
          </div>

          <label className="mt-2 block text-xs text-slate-400">
            <span className="mb-1 block">地面阈值</span>
            <input
              className="h-8 w-full border-(solid 1px slate-700) rounded bg-slate-900 px-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-400 disabled:opacity-45"
              type="number"
              min="0"
              step="0.01"
              disabled={requestingCamera !== null}
              value={pointCloudRoiRequest.ground_distance_threshold}
              onChange={event => updatePointCloudRoiNumber('ground_distance_threshold', event.currentTarget.valueAsNumber)} />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            className="h-9 w-9 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700"
            type="button"
            aria-label="减小点云点"
            onClick={decreasePointSize}>
            <div className="i-material-symbols-remove-rounded text-5" />
          </button>
          <div className="min-w-0 flex-1 text-center text-sm">
            点大小 {pointCloudPointSize.toFixed(2)}
          </div>
          <button
            className="h-9 w-9 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700"
            type="button"
            aria-label="增大点云点"
            onClick={increasePointSize}>
            <div className="i-material-symbols-add-rounded text-5" />
          </button>
          <button
            className="h-9 w-9 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700"
            type="button"
            aria-label="重置视角"
            onClick={fitCameraToClouds}>
            <div className="i-material-symbols-center-focus-strong-rounded text-5" />
          </button>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs text-slate-300" htmlFor="pointcloud-topics">订阅 Topic</label>
          <textarea
            id="pointcloud-topics"
            className="h-8rem w-full resize-none border-(solid 1px slate-700) rounded bg-slate-950 p-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-400"
            spellCheck={false}
            value={draftTopics}
            onChange={event => setDraftTopics(event.target.value)} />
          <div className="mt-2 flex justify-between gap-2">
            <button
              className="rounded border-(solid 1px slate-700) px-3 py-1 text-sm hover:bg-slate-800"
              type="button"
              onClick={resetTopics}>
              默认
            </button>
            <button
              className="rounded bg-sky-600 px-3 py-1 text-sm hover:bg-sky-700"
              type="button"
              onClick={applyTopics}>
              应用
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-2 text-xs">
          {topicSummaries.length > 0
            ? topicSummaries.map(summary => (
                <div
                  key={summary.topic}
                  className="border-(solid 1px slate-800) bg-slate-950 p-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: summary.color }} />
                    <span className="min-w-0 truncate font-mono">{summary.topic}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-2 text-slate-400">
                    <span className="min-w-0 truncate">
                      {summary.originalFrameId ? `${summary.originalFrameId} -> ${summary.frameId}` : summary.frameId}
                    </span>
                    <span>{summary.points}</span>
                  </div>
                  {summary.transformApplied === false && (
                    <div className="mt-1 text-amber-300">
                      未转换到 base_footprint
                    </div>
                  )}
                </div>
            ))
            : (
                <div className="border-(solid 1px slate-800) bg-slate-950 p-3 text-slate-400">
                  等待点云数据
                </div>
              )}
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <div
          ref={containerRef}
          className="h-full w-full" />
        {totalPoints === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400">
            等待点云数据
          </div>
        )}
      </main>
    </div>
  )
}

export default PointCloud3DView
