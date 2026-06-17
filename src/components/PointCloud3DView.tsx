import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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
  const updatePointCloudPointSize = useGridStore(state => state.updatePointCloudPointSize)
  const pointCloudTopics = useParamsStore(state => state.pointCloudTopics)
  const updatePointCloudTopics = useParamsStore(state => state.updatePointCloudTopics)
  const [draftTopics, setDraftTopics] = useState(formatTopics(pointCloudTopics))

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

  return (
    <div className="fixed inset-0 z-80 flex bg-slate-950 text-white">
      <aside className="w-21rem shrink-0 border-(r-solid 1px slate-800) bg-slate-900 p-4">
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
