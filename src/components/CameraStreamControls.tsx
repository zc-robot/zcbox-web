import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import apiServer from '@/service/apiServer'
import type { CameraSource, CameraSourcesResponse } from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'

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

const roiNumberFields: Array<{ key: keyof Pick<ZenohPointCloudRoiRequest, 'min_x' | 'max_x' | 'min_y' | 'max_y' | 'min_z' | 'max_z'>; label: string }> = [
  { key: 'min_x', label: 'X 最小' },
  { key: 'max_x', label: 'X 最大' },
  { key: 'min_y', label: 'Y 最小' },
  { key: 'max_y', label: 'Y 最大' },
  { key: 'min_z', label: 'Z 最小' },
  { key: 'max_z', label: 'Z 最大' },
]

interface PointCloudRoiResultState {
  key: string
  frameId: string
  pointCount: number
  sampledCount: number
  message: string
}

function formatFrame(source: CameraSource | null) {
  const frame = source?.latest_frame
  if (!frame || frame.width <= 0 || frame.height <= 0)
    return '--'

  const fps = Number.isFinite(frame.fps) && frame.fps > 0 ? ` ${frame.fps.toFixed(1)}fps` : ''
  return `${frame.width}x${frame.height}${fps}`
}

function getFrameSize(source: CameraSource | null) {
  const frame = source?.latest_frame
  if (!frame || frame.width <= 0 || frame.height <= 0)
    return null

  return {
    width: frame.width,
    height: frame.height,
  }
}

function getMediaFitClass(source: CameraSource | null) {
  const frameSize = getFrameSize(source)
  if (!frameSize)
    return 'h-full w-full object-contain'

  return frameSize.width < frameSize.height
    ? 'h-full w-auto max-w-full object-contain'
    : 'h-auto w-full max-h-full object-contain'
}

function getFrameStyle(source: CameraSource | null) {
  const frameSize = getFrameSize(source)
  if (!frameSize)
    return undefined

  return {
    aspectRatio: `${frameSize.width} / ${frameSize.height}`,
  }
}

function isDepthSource(source: CameraSource | null) {
  if (!source)
    return false

  return /depth/i.test(`${source.id} ${source.topic} ${source.ros_type}`)
}

function getDepthCameraName(source: CameraSource | null) {
  if (!source)
    return ''

  const value = `${source.topic} ${source.id}`
  const match = value.match(/(?:^|[/\s_-])(camera_[A-Za-z0-9]+)(?:$|[/\s_-])/i)
  return match?.[1] ?? ''
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error))
    return String(error)

  return error.message
    .replace(/^Error invoking remote method 'camera-gateway:request':\s*/, '')
    .replace(/^Error invoking remote method 'zenoh-command:get-point-cloud-roi':\s*/, '')
    .replace(/^Error:\s*/, '')
}

const depthColorStops = [
  { at: 0, color: [48, 18, 59] },
  { at: 0.16, color: [65, 69, 171] },
  { at: 0.32, color: [0, 184, 235] },
  { at: 0.52, color: [63, 250, 85] },
  { at: 0.68, color: [249, 247, 36] },
  { at: 0.84, color: [249, 142, 9] },
  { at: 1, color: [215, 25, 28] },
]

function getDepthColor(value: number) {
  const normalized = Math.min(1, Math.max(0, value))
  for (let index = 1; index < depthColorStops.length; index += 1) {
    const previous = depthColorStops[index - 1]
    const next = depthColorStops[index]
    if (normalized > next.at)
      continue

    const span = Math.max(next.at - previous.at, 0.001)
    const ratio = (normalized - previous.at) / span
    return previous.color.map((channel, channelIndex) => {
      return Math.round(channel + (next.color[channelIndex] - channel) * ratio)
    })
  }

  return depthColorStops[depthColorStops.length - 1].color
}

function getDepthRange(data: Uint8ClampedArray) {
  const histogram = new Uint32Array(256)
  let validCount = 0

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0)
      continue

    const luminance = Math.round((data[index] + data[index + 1] + data[index + 2]) / 3)
    if (luminance <= 4)
      continue

    histogram[luminance] += 1
    validCount += 1
  }

  if (validCount === 0)
    return null

  const percentile = (ratio: number) => {
    const target = validCount * ratio
    let seen = 0
    for (let value = 0; value < histogram.length; value += 1) {
      seen += histogram[value]
      if (seen >= target)
        return value
    }

    return 255
  }

  const min = percentile(0.02)
  const max = percentile(0.98)
  return {
    min,
    max: Math.max(max, min + 1),
  }
}

function applyDepthColormap(imageData: ImageData) {
  const { data } = imageData
  const range = getDepthRange(data)
  if (!range)
    return imageData

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) {
      data[index] = 0
      data[index + 1] = 0
      data[index + 2] = 0
      data[index + 3] = 255
      continue
    }

    const luminance = Math.round((data[index] + data[index + 1] + data[index + 2]) / 3)
    if (luminance <= 4) {
      data[index] = 0
      data[index + 1] = 0
      data[index + 2] = 0
      data[index + 3] = 255
      continue
    }

    const normalized = (luminance - range.min) / (range.max - range.min)
    const [red, green, blue] = getDepthColor(normalized)
    data[index] = red
    data[index + 1] = green
    data[index + 2] = blue
    data[index + 3] = 255
  }

  return imageData
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('加载深度图失败'))
    image.src = src
  })
}

const ColorizedDepthPreview: FC<{ active: boolean; source: CameraSource; mediaClassName: string }> = ({ active, source, mediaClassName }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasFrame, setHasFrame] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    let timeoutId: number | null = null

    const drawFrame = async () => {
      try {
        const src = await apiServer.fetchCameraSnapshotDataUrl(source)
        const image = await loadImage(src)
        if (src.startsWith('blob:'))
          URL.revokeObjectURL(src)
        if (disposed)
          return

        const canvas = canvasRef.current
        const context = canvas?.getContext('2d', { willReadFrequently: true })
        if (!canvas || !context)
          return

        canvas.width = image.naturalWidth || image.width
        canvas.height = image.naturalHeight || image.height
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        context.putImageData(applyDepthColormap(imageData), 0, 0)
        setHasFrame(true)
        setError('')
      }
      catch (error) {
        if (!disposed)
          setError(getErrorMessage(error))
      }
      finally {
        if (!disposed && active)
          timeoutId = window.setTimeout(drawFrame, 125)
      }
    }

    drawFrame()

    return () => {
      disposed = true
      if (timeoutId != null)
        window.clearTimeout(timeoutId)
    }
  }, [active, source])

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`block ${mediaClassName}`}
        style={getFrameStyle(source)} />
      {!hasFrame && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          {error || '加载彩色深度...'}
        </div>
      )}
    </>
  )
}

const CameraStreamModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const updatePointCloud = useGridStore(state => state.updatePointCloud)
  const setPointCloudVisibility = useGridStore(state => state.setPointCloudVisibility)
  const [sourcesResponse, setSourcesResponse] = useState<CameraSourcesResponse | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [liveUrl, setLiveUrl] = useState('')
  const [activeSourceId, setActiveSourceId] = useState('')
  const [isLoadingSources, setLoadingSources] = useState(false)
  const [isStarting, setStarting] = useState(false)
  const [isStopping, setStopping] = useState(false)
  const [isPointCloudLoading, setPointCloudLoading] = useState(false)
  const [isDepthColorEnabled, setDepthColorEnabled] = useState(true)
  const [pointCloudRoiRequest, setPointCloudRoiRequest] = useState(defaultPointCloudRoiRequest)
  const [pointCloudResult, setPointCloudResult] = useState<PointCloudRoiResultState | null>(null)
  const [error, setError] = useState('')
  const activeSourceRef = useRef<CameraSource | null>(null)

  const sources = useMemo(() => sourcesResponse?.sources ?? [], [sourcesResponse])
  const selectedSource = useMemo(() => {
    return sources.find(source => source.id === selectedSourceId) ?? null
  }, [selectedSourceId, sources])
  const isStreaming = activeSourceId !== ''
  const isBusy = isLoadingSources || isStarting || isStopping || isPointCloudLoading
  const selectedSourceIsDepth = isDepthSource(selectedSource)
  const selectedDepthCameraName = getDepthCameraName(selectedSource)
  const shouldColorizeDepth = selectedSourceIsDepth && isDepthColorEnabled
  const mediaClassName = `block ${getMediaFitClass(selectedSource)}`
  const mediaStyle = getFrameStyle(selectedSource)
  const canRequestPointCloudRoi = selectedSourceIsDepth
    && !!selectedDepthCameraName
    && !!nestControllerIp
    && !!window.zcDesktop?.getZenohPointCloudRoi

  const updatePointCloudRoiNumber = (key: PointCloudRoiNumberKey, value: number) => {
    if (!Number.isFinite(value))
      return

    setPointCloudResult(null)
    setPointCloudRoiRequest(current => ({
      ...current,
      [key]: value,
    }))
  }

  const loadSources = useCallback(async () => {
    setLoadingSources(true)
    setError('')
    try {
      const response = await apiServer.fetchCameraSources()
      setSourcesResponse(response)
      setSelectedSourceId((current) => {
        if (current && response.sources.some(source => source.id === current))
          return current

        return response.sources.find(source => source.available)?.id ?? response.sources[0]?.id ?? ''
      })
    }
    catch (error) {
      const message = getErrorMessage(error)
      setError(message)
      toast.error(`加载摄像头失败 ${message}`)
    }
    finally {
      setLoadingSources(false)
    }
  }, [])

  const stopStream = useCallback(async () => {
    const source = activeSourceRef.current ?? sources.find(source => source.id === activeSourceId)
    setPreviewUrl('')
    setLiveUrl('')
    setActiveSourceId('')
    activeSourceRef.current = null

    if (!source)
      return

    setStopping(true)
    setError('')
    try {
      await apiServer.stopCameraStream(source)
      toast.success('视频流已停止')
    }
    catch (error) {
      const message = getErrorMessage(error)
      setError(message)
      toast.error(`停止视频流失败 ${message}`)
    }
    finally {
      setStopping(false)
    }
  }, [activeSourceId, sources])

  useEffect(() => {
    loadSources()
  }, [loadSources])

  useEffect(() => {
    activeSourceRef.current = sources.find(source => source.id === activeSourceId) ?? null
  }, [activeSourceId, sources])

  useEffect(() => {
    return () => {
      if (activeSourceRef.current)
        void apiServer.stopCameraStream(activeSourceRef.current)
    }
  }, [])

  const snapshotUrl = selectedSource && !isStreaming
    ? apiServer.cameraGatewayUrl(selectedSource.paths.snapshot, true)
    : ''

  const startStream = async () => {
    if (!selectedSource) {
      toast.error('未找到摄像头')
      return
    }

    if (!selectedSource.available) {
      toast.error('摄像头不可用')
      return
    }

    setStarting(true)
    setError('')
    try {
      const response = await apiServer.startCameraStream(selectedSource)
      if (!response.ok)
        throw new Error(response.message || '启动视频流失败')

      activeSourceRef.current = selectedSource
      setActiveSourceId(selectedSource.id)
      setLiveUrl(response.live?.url ?? '')
      setPreviewUrl(apiServer.cameraGatewayUrl(selectedSource.paths.preview, true))
      toast.success('视频流已启动')
    }
    catch (error) {
      const message = getErrorMessage(error)
      setError(message)
      toast.error(`启动视频流失败 ${message}`)
    }
    finally {
      setStarting(false)
    }
  }

  const requestPointCloudRoi = async () => {
    if (!selectedSource || !selectedSourceIsDepth) {
      toast.error('请选择深度相机')
      return
    }

    if (!selectedDepthCameraName) {
      toast.error('未识别到深度相机名称')
      return
    }

    if (!nestControllerIp) {
      toast.error('未连接机器人控制器')
      return
    }

    if (!window.zcDesktop?.getZenohPointCloudRoi) {
      toast.error('点云 ROI 仅支持桌面应用')
      return
    }

    setPointCloudLoading(true)
    setPointCloudResult(null)
    setError('')
    try {
      const namespace = await apiServer.fetchZenohNamespace()
      const response = await window.zcDesktop.getZenohPointCloudRoi({
        host: nestControllerIp,
        namespace,
        cameraName: selectedDepthCameraName,
        request: pointCloudRoiRequest,
        timeoutMs: 10000,
        maxPoints: 12000,
      })

      updatePointCloud(response.pointCloud)
      setPointCloudResult({
        key: response.key,
        frameId: response.pointCloud.frameId,
        pointCount: response.pointCloud.pointCount,
        sampledCount: response.pointCloud.sampledCount,
        message: response.message,
      })
      toast.success(`点云已获取 ${response.pointCloud.sampledCount} 点`)
    }
    catch (error) {
      const message = getErrorMessage(error)
      setError(message)
      toast.error(`获取点云失败 ${message}`)
    }
    finally {
      setPointCloudLoading(false)
    }
  }

  const closeModal = async () => {
    if (isStreaming)
      await stopStream()

    onClose()
  }

  const openPointCloudView = async () => {
    setPointCloudVisibility(true)
    await closeModal()
  }

  const previewContent = (() => {
    if (selectedSource && shouldColorizeDepth && (previewUrl || snapshotUrl)) {
      return (
        <ColorizedDepthPreview
          active={isStreaming}
          source={selectedSource}
          mediaClassName={mediaClassName} />
      )
    }

    if (previewUrl) {
      return (
        <img
          className={mediaClassName}
          style={mediaStyle}
          alt="camera preview"
          src={previewUrl} />
      )
    }

    if (snapshotUrl) {
      return (
        <img
          className={`${mediaClassName} opacity-85`}
          style={mediaStyle}
          alt="camera snapshot"
          src={snapshotUrl} />
      )
    }

    return (
      <div className="h-full w-full flex items-center justify-center text-gray-400">
        {isLoadingSources ? '加载摄像头...' : '无视频源'}
      </div>
    )
  })()

  return (
    <div className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-(justify-center items-center) bg-gray-900/35">
      <div className="min-w-0 w-[calc(100vw-3rem)] max-w-72rem max-h-[calc(100vh-3rem)] overflow-hidden rounded bg-white shadow-xl">
        <div className="flex h-12 items-center justify-between border-(b-solid 1px gray-200) px-4">
          <div className="flex items-center gap-2 text-gray-900 font-600">
            <div className="i-material-symbols-videocam-outline-rounded text-5 text-blue-600" />
            <span>视频流</span>
          </div>
          <button
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100"
            type="button"
            aria-label="关闭视频流"
            onClick={closeModal}>
            <div className="i-material-symbols-close-rounded text-5 text-gray-600" />
          </button>
        </div>

        <div className="flex">
          <aside className="w-18rem shrink-0 border-(r-solid 1px gray-200) p-4 text-sm text-gray-800">
            <label className="mb-2 block font-600" htmlFor="camera-source">摄像头</label>
            <select
              id="camera-source"
              className="w-full rounded border-(solid 1px gray-300) bg-white px-2 py-2 outline-none focus:border-blue-500"
              disabled={isStreaming || isBusy}
              value={selectedSourceId}
              onChange={(event) => {
                setSelectedSourceId(event.target.value)
                setError('')
                setDepthColorEnabled(true)
                setPointCloudResult(null)
              }}>
              {sources.map(source => (
                <option key={source.id} value={source.id}>
                  {source.topic || source.id}
                </option>
              ))}
            </select>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border-(solid 1px gray-200) p-2">
                <div className="text-gray-500">状态</div>
                <div className={selectedSource?.available ? 'text-green-700 font-600' : 'text-gray-500 font-600'}>
                  {selectedSource?.available ? '可用' : '不可用'}
                </div>
              </div>
              <div className="rounded border-(solid 1px gray-200) p-2">
                <div className="text-gray-500">画面</div>
                <div className="font-600">{formatFrame(selectedSource)}</div>
              </div>
            </div>

            {selectedSourceIsDepth && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDepthColorEnabled}
                  onChange={event => setDepthColorEnabled(event.target.checked)} />
                <span>彩色深度</span>
              </label>
            )}

            {selectedSourceIsDepth && (
              <div className="mt-3 rounded border-(solid 1px gray-200) p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-600">点云 ROI</div>
                  <div className="max-w-24 truncate font-mono text-xs text-gray-500">
                    {selectedDepthCameraName || '--'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {roiNumberFields.map(field => (
                    <label key={field.key} className="block text-xs text-gray-600">
                      <span className="mb-1 block">{field.label}</span>
                      <input
                        className="h-8 w-full rounded border-(solid 1px gray-300) px-2 text-sm outline-none focus:border-blue-500"
                        type="number"
                        step="0.05"
                        value={pointCloudRoiRequest[field.key]}
                        onChange={event => updatePointCloudRoiNumber(field.key, event.currentTarget.valueAsNumber)} />
                    </label>
                  ))}
                </div>

                <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={pointCloudRoiRequest.remove_ground}
                    onChange={(event) => {
                      setPointCloudResult(null)
                      setPointCloudRoiRequest(current => ({
                        ...current,
                        remove_ground: event.target.checked,
                      }))
                    }} />
                  <span>去除地面</span>
                </label>

                {pointCloudRoiRequest.remove_ground && (
                  <label className="mt-2 block text-xs text-gray-600">
                    <span className="mb-1 block">阈值</span>
                    <input
                      className="h-8 w-full rounded border-(solid 1px gray-300) px-2 text-sm outline-none focus:border-blue-500"
                      type="number"
                      min="0"
                      step="0.01"
                      value={pointCloudRoiRequest.ground_distance_threshold}
                      onChange={event => updatePointCloudRoiNumber('ground_distance_threshold', event.currentTarget.valueAsNumber)} />
                  </label>
                )}

                <button
                  className="mt-3 h-9 w-full flex items-center justify-center gap-1 rounded bg-sky-600 px-3 text-white hover:bg-sky-700 disabled:opacity-45"
                  type="button"
                  disabled={isBusy || !canRequestPointCloudRoi}
                  onClick={requestPointCloudRoi}>
                  <div className={isPointCloudLoading ? 'i-material-symbols-refresh-rounded animate-spin text-4' : 'i-material-symbols-view-in-ar-outline-rounded text-4'} />
                  <span>{isPointCloudLoading ? '获取中' : '获取点云'}</span>
                </button>

                {pointCloudResult && (
                  <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">点数</span>
                      <span className="font-600">{pointCloudResult.sampledCount} / {pointCloudResult.pointCount}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-gray-500">坐标系</span>
                      <span className="max-w-36 truncate font-mono">{pointCloudResult.frameId || 'base_footprint'}</span>
                    </div>
                    {pointCloudResult.message && pointCloudResult.message !== 'success' && (
                      <div className="mt-1 break-words text-gray-500">{pointCloudResult.message}</div>
                    )}
                    <button
                      className="mt-2 h-8 w-full flex items-center justify-center gap-1 rounded border-(solid 1px gray-300) bg-white px-2 text-gray-700 hover:bg-gray-50"
                      type="button"
                      onClick={openPointCloudView}>
                      <div className="i-material-symbols-open-in-full-rounded text-4" />
                      <span>查看 3D</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                className="h-9 flex flex-1 items-center justify-center gap-1 rounded border-(solid 1px gray-300) bg-white px-3 text-gray-700 hover:bg-gray-50 disabled:opacity-45"
                type="button"
                disabled={isBusy}
                onClick={loadSources}>
                <div className="i-material-symbols-refresh-rounded text-4" />
                <span>刷新</span>
              </button>
              {isStreaming
                ? (
                    <button
                      className="h-9 flex flex-1 items-center justify-center gap-1 rounded bg-red-600 px-3 text-white hover:bg-red-700 disabled:opacity-45"
                      type="button"
                      disabled={isBusy}
                      onClick={stopStream}>
                      <div className="i-material-symbols-stop-rounded text-4" />
                      <span>停止</span>
                    </button>
                  )
                : (
                    <button
                      className="h-9 flex flex-1 items-center justify-center gap-1 rounded bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-45"
                      type="button"
                      disabled={isBusy || !selectedSource}
                      onClick={startStream}>
                      <div className="i-material-symbols-play-arrow-rounded text-4" />
                      <span>启动</span>
                    </button>
                  )}
            </div>

            {liveUrl && (
              <div className="mt-4">
                <label className="mb-1 block text-xs text-gray-500" htmlFor="rtsp-url">RTSP</label>
                <input
                  id="rtsp-url"
                  className="w-full rounded border-(solid 1px gray-300) bg-gray-50 px-2 py-1 font-mono text-xs"
                  readOnly
                  value={liveUrl} />
              </div>
            )}

            {error && (
              <div className="mt-4 rounded border-(solid 1px red-200) bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </aside>

          <section className="min-w-0 flex-1 bg-gray-950 p-4">
            <div className="relative h-[min(70vh,44rem)] min-h-26rem overflow-hidden rounded bg-black flex items-center justify-center">
              {previewContent}
              {isStreaming && (
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>LIVE</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

const CameraStreamControls: FC = () => {
  const [isOpen, setOpen] = useState(false)
  const openModal = () => setOpen(true)

  return (
    <>
      <div
        className={`${isOpen ? 'panel-item-enabled' : 'panel-item'} group`}
        role="button"
        tabIndex={0}
        title="视频流"
        aria-label="视频流"
        onClick={openModal}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openModal()
          }
        }}>
        <div className="i-material-symbols-videocam-outline-rounded panel-icon" />
        <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible whitespace-nowrap">
          视频流
        </span>
      </div>
      {isOpen && <CameraStreamModal onClose={() => setOpen(false)} />}
    </>
  )
}

export default CameraStreamControls
