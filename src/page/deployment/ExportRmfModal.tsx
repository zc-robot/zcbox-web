import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import type { MapListItem, NavLift, NavProfile } from '@/types'
import apiServer from '@/service/apiServer'
import { useGridStore } from '@/store'
import { getLiftRectangleCorners, mapToPixel } from '@/util/rmf'
import type { PixelPoint, RmfAlignmentOptions, RmfVisualMapAlignmentOptions } from '@/util/rmf'
import { convertMapRasterToPngBlob } from '@/util/transform'

export interface ExportRmfSelection {
  map: MapListItem
  profile: NavProfile
}

export type ExportRmfAlignment = RmfAlignmentOptions | null

interface ExportRmfModalProps {
  currentMapId: number
  currentProfileUid?: string
  defaultUploadHost: string
  isSubmitting?: boolean
  onClose: () => void
  onConfirm: (selections: ExportRmfSelection[], targetHost: string, alignment: ExportRmfAlignment) => void
}

type AlignmentMode = 'metadata' | 'visual-lift'
interface MapTransform {
  x: number
  y: number
  rotation: number
}

interface MapImagePreview {
  status: 'loading' | 'ready' | 'error'
  width: number
  height: number
  url?: string
  error?: string
}

interface AlignmentView {
  zoom: number
  panX: number
  panY: number
}

const DEFAULT_ALIGNMENT_VIEW: AlignmentView = {
  zoom: 1,
  panX: 0,
  panY: 0,
}
const MIN_ALIGNMENT_VIEW_ZOOM = 0.4
const MAX_ALIGNMENT_VIEW_ZOOM = 8

function removeMapValue<T>(record: Record<number, T>, mapId: number) {
  const next = { ...record }
  delete next[mapId]
  return next
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeAlignmentView(view: AlignmentView): AlignmentView {
  return {
    zoom: clampNumber(Number.isFinite(view.zoom) ? view.zoom : 1, MIN_ALIGNMENT_VIEW_ZOOM, MAX_ALIGNMENT_VIEW_ZOOM),
    panX: Number.isFinite(view.panX) ? view.panX : 0,
    panY: Number.isFinite(view.panY) ? view.panY : 0,
  }
}

function getLiftLabel(lift: NavLift) {
  const name = lift.name.trim()
  return name || lift.uid
}

function formatDraftValue(value: number) {
  if (!Number.isFinite(value))
    return '0'

  const rounded = Number(value.toFixed(3))
  return Object.is(rounded, -0) ? '0' : `${rounded}`
}

function parseDraftValue(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function findSelectedProfile(map: MapListItem, profilesByMapId: Record<number, NavProfile[]>, selectedProfileIds: Record<number, string>) {
  const profiles = profilesByMapId[map.id]
  const selectedProfileId = selectedProfileIds[map.id]
  return profiles?.find(profile => profile.uid === selectedProfileId)
}

function formatRmfUploadEndpoint(targetHost: string) {
  const trimmedHost = targetHost.trim()
  if (!trimmedHost)
    return '请输入目标 IP / Host'

  try {
    const url = new URL(/^https?:\/\//i.test(trimmedHost) ? trimmedHost : `http://${trimmedHost}`)
    if (!url.port)
      url.port = '6080'
    url.pathname = '/api/map/building_yaml'
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  catch {
    return '目标 IP / Host 格式不正确'
  }
}

function getLiftPixelCorners(lift: NavLift, map: MapListItem): [PixelPoint, PixelPoint, PixelPoint, PixelPoint] {
  return getLiftRectangleCorners(lift)
    .map(point => mapToPixel(point, map.info)) as [PixelPoint, PixelPoint, PixelPoint, PixelPoint]
}

function getPointCenter(points: PixelPoint[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function getPointAngle(start: PixelPoint, end: PixelPoint) {
  return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
}

function rotatePoint(point: PixelPoint, center: PixelPoint, rotation: number) {
  const theta = rotation * Math.PI / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const dx = point.x - center.x
  const dy = point.y - center.y

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

function transformMapPoint(point: PixelPoint, image: MapImagePreview, transform: MapTransform) {
  const rotated = rotatePoint(point, { x: image.width / 2, y: image.height / 2 }, transform.rotation)
  return {
    x: rotated.x + transform.x,
    y: rotated.y + transform.y,
  }
}

function inverseTransformMapPoint(point: PixelPoint, image: MapImagePreview, transform: MapTransform) {
  const translated = {
    x: point.x - transform.x,
    y: point.y - transform.y,
  }
  return rotatePoint(translated, { x: image.width / 2, y: image.height / 2 }, -transform.rotation)
}

function buildPolygonPoints(points: PixelPoint[]) {
  return points
    .map(point => `${formatDraftValue(point.x)},${formatDraftValue(point.y)}`)
    .join(' ')
}

function getDefaultMapTransform(referenceMap: MapListItem, referenceLift: NavLift, targetMap: MapListItem, targetLift: NavLift, targetImage: MapImagePreview): MapTransform {
  const referenceCorners = getLiftPixelCorners(referenceLift, referenceMap)
  const targetCorners = getLiftPixelCorners(targetLift, targetMap)
  const referenceCenter = getPointCenter(referenceCorners)
  const targetCenter = getPointCenter(targetCorners)
  const rotation = getPointAngle(referenceCorners[0], referenceCorners[1]) - getPointAngle(targetCorners[0], targetCorners[1])
  const rotatedTargetCenter = rotatePoint(targetCenter, { x: targetImage.width / 2, y: targetImage.height / 2 }, rotation)

  return {
    x: referenceCenter.x - rotatedTargetCenter.x,
    y: referenceCenter.y - rotatedTargetCenter.y,
    rotation,
  }
}

function getMapImagePath(map: MapListItem) {
  return map.navigation_map_file_path || map.localization_map_file_path
}

interface DraftNumberFieldProps {
  label: string
  value: number
  step: number
  disabled: boolean
  onChange: (value: number) => void
}

const DraftNumberField: React.FC<DraftNumberFieldProps> = ({ label, value, step, disabled, onChange }) => (
  <label className="min-w-0">
    <span className="block text-xs text-gray-500 mb-1">{label}</span>
    <input
      type="number"
      step={step}
      className="w-full box-border bg-gray-50 border-(solid 1px gray-300) rounded-md px-2 py-1 text-xs"
      value={formatDraftValue(value)}
      disabled={disabled}
      onChange={event => onChange(parseDraftValue(event.target.value, value))} />
  </label>
)

interface MapAlignmentPreviewProps {
  referenceImage: MapImagePreview
  referenceCorners: [PixelPoint, PixelPoint, PixelPoint, PixelPoint]
  targetImage?: MapImagePreview
  targetCorners?: [PixelPoint, PixelPoint, PixelPoint, PixelPoint]
  targetTransform?: MapTransform
  view: AlignmentView
  disabled: boolean
  onViewChange: (view: AlignmentView) => void
  onTargetTransformChange: (transform: MapTransform) => void
}

interface MapDragStart {
  point: PixelPoint
  transform: MapTransform
}

const MapAlignmentPreview: React.FC<MapAlignmentPreviewProps> = ({
  referenceImage,
  referenceCorners,
  targetImage,
  targetCorners,
  targetTransform,
  view,
  disabled,
  onViewChange,
  onTargetTransformChange,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragStartRef = useRef<MapDragStart | null>(null)
  const padding = Math.max(referenceImage.width, referenceImage.height) * 0.12
  const viewBaseWidth = referenceImage.width + padding * 2
  const viewBaseHeight = referenceImage.height + padding * 2
  const normalizedView = normalizeAlignmentView(view)
  const viewWidth = viewBaseWidth / normalizedView.zoom
  const viewHeight = viewBaseHeight / normalizedView.zoom
  const viewCenterX = referenceImage.width / 2 + normalizedView.panX
  const viewCenterY = referenceImage.height / 2 + normalizedView.panY
  const viewBox = `${viewCenterX - viewWidth / 2} ${viewCenterY - viewHeight / 2} ${viewWidth} ${viewHeight}`
  const transformedTargetCorners = targetImage && targetCorners && targetTransform
    ? targetCorners.map(point => transformMapPoint(point, targetImage, targetTransform))
    : []

  const getSvgPoint = (event: React.PointerEvent<SVGSVGElement>): PixelPoint | null => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix)
      return null

    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return { x: transformed.x, y: transformed.y }
  }

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    onViewChange(normalizeAlignmentView({
      ...normalizedView,
      zoom: normalizedView.zoom * factor,
    }))
  }

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || !targetTransform)
      return

    const point = getSvgPoint(event)
    if (!point)
      return

    dragStartRef.current = {
      point,
      transform: targetTransform,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const dragStart = dragStartRef.current
    if (!dragStart)
      return

    const point = getSvgPoint(event)
    if (!point)
      return

    onTargetTransformChange({
      ...dragStart.transform,
      x: dragStart.transform.x + point.x - dragStart.point.x,
      y: dragStart.transform.y + point.y - dragStart.point.y,
    })
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    dragStartRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <svg
      ref={svgRef}
      className="w-full h-92 rounded-lg bg-slate-100 border-(solid 1px slate-200) touch-none"
      viewBox={viewBox}
      role="img"
      aria-label="map alignment preview"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}>
      <rect x={-padding} y={-padding} width={referenceImage.width + padding * 2} height={referenceImage.height + padding * 2} fill="#f8fafc" />
      <image href={referenceImage.url} x="0" y="0" width={referenceImage.width} height={referenceImage.height} opacity="0.72" />
      <polygon points={buildPolygonPoints(referenceCorners)} fill="#2563eb" fillOpacity="0.12" stroke="#2563eb" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      {targetImage && targetTransform && (
        <g transform={`translate(${targetTransform.x} ${targetTransform.y}) rotate(${targetTransform.rotation} ${targetImage.width / 2} ${targetImage.height / 2})`} className={disabled ? '' : 'cursor-move'}>
          <image href={targetImage.url} x="0" y="0" width={targetImage.width} height={targetImage.height} opacity="0.48" />
        </g>
      )}
      {transformedTargetCorners.length > 0 && (
        <polygon points={buildPolygonPoints(transformedTargetCorners)} fill="#059669" fillOpacity="0.18" stroke="#059669" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}

const ExportRmfModal: React.FC<ExportRmfModalProps> = ({
  currentMapId,
  currentProfileUid,
  defaultUploadHost,
  isSubmitting = false,
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
  const [targetHost, setTargetHost] = useState(defaultUploadHost)
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>('metadata')
  const [referenceMapId, setReferenceMapId] = useState(currentMapId || 0)
  const [selectedLiftIds, setSelectedLiftIds] = useState<Record<number, string>>({})
  const [mapImagesById, setMapImagesById] = useState<Record<number, MapImagePreview>>({})
  const [mapTransformsById, setMapTransformsById] = useState<Record<number, MapTransform>>({})
  const [activeAlignmentMapId, setActiveAlignmentMapId] = useState(0)
  const [alignmentView, setAlignmentView] = useState<AlignmentView>(DEFAULT_ALIGNMENT_VIEW)
  const [alignmentConfirmationsByMapId, setAlignmentConfirmationsByMapId] = useState<Record<number, string>>({})
  const mapImagesRef = useRef<Record<number, MapImagePreview>>({})
  const loadingMapImageIdsRef = useRef<Set<number>>(new Set())
  const selectedMapIdsRef = useRef<Set<number>>(new Set(selectedMapIds))
  const isMountedRef = useRef(true)

  useEffect(() => {
    setTargetHost(defaultUploadHost)
  }, [defaultUploadHost])

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

  const selectedProfilesByMapId = useMemo(() => {
    const selectedProfiles = new Map<number, NavProfile>()

    orderedSelectedMaps.forEach((map) => {
      const profile = findSelectedProfile(map, profilesByMapId, selectedProfileIds)
      if (profile)
        selectedProfiles.set(map.id, profile)
    })

    return selectedProfiles
  }, [orderedSelectedMaps, profilesByMapId, selectedProfileIds])

  const referenceMap = useMemo(
    () => orderedSelectedMaps.find(map => map.id === referenceMapId),
    [orderedSelectedMaps, referenceMapId],
  )
  const referenceProfile = referenceMap ? selectedProfilesByMapId.get(referenceMap.id) : undefined
  const referenceLift = referenceProfile?.data.lifts.find(lift => lift.uid === selectedLiftIds[referenceMapId])
    ?? referenceProfile?.data.lifts[0]
  const referenceLiftLabel = referenceLift ? getLiftLabel(referenceLift) : undefined
  const alignmentTargetMaps = useMemo(
    () => orderedSelectedMaps.filter(map => map.id !== referenceMapId),
    [orderedSelectedMaps, referenceMapId],
  )

  useEffect(() => {
    mapImagesRef.current = mapImagesById
  }, [mapImagesById])

  useEffect(() => {
    selectedMapIdsRef.current = new Set(selectedMapIds)
  }, [selectedMapIds])

  useEffect(() => () => {
    isMountedRef.current = false
    Object.values(mapImagesRef.current).forEach((preview) => {
      if (preview.url)
        URL.revokeObjectURL(preview.url)
    })
  }, [])

  useEffect(() => {
    if (orderedSelectedMaps.length === 0) {
      setReferenceMapId(0)
      setMapTransformsById({})
      setAlignmentConfirmationsByMapId({})
      return
    }

    if (!orderedSelectedMaps.some(map => map.id === referenceMapId)) {
      setReferenceMapId(orderedSelectedMaps[0].id)
      setMapTransformsById({})
      setAlignmentConfirmationsByMapId({})
    }
  }, [orderedSelectedMaps, referenceMapId])

  useEffect(() => {
    setSelectedLiftIds((prev) => {
      let changed = false
      const next = { ...prev }
      const selectedMapIdSet = new Set(orderedSelectedMaps.map(map => map.id))

      Object.keys(next).forEach((mapIdValue) => {
        const mapId = Number(mapIdValue)
        if (!selectedMapIdSet.has(mapId)) {
          delete next[mapId]
          changed = true
        }
      })

      orderedSelectedMaps.forEach((map) => {
        const profile = selectedProfilesByMapId.get(map.id)
        const lifts = profile?.data.lifts ?? []
        const selectedLiftId = next[map.id]

        if (selectedLiftId && lifts.some(lift => lift.uid === selectedLiftId))
          return

        const matchingReferenceLift = referenceLiftLabel
          ? lifts.find(lift => getLiftLabel(lift) === referenceLiftLabel)
          : undefined
        const defaultLiftId = matchingReferenceLift?.uid ?? lifts[0]?.uid

        if (defaultLiftId) {
          next[map.id] = defaultLiftId
          changed = true
          return
        }

        if (selectedLiftId) {
          delete next[map.id]
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [orderedSelectedMaps, referenceLiftLabel, selectedProfilesByMapId])

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

  useEffect(() => {
    if (alignmentTargetMaps.length === 0) {
      setActiveAlignmentMapId(0)
      return
    }

    if (!alignmentTargetMaps.some(map => map.id === activeAlignmentMapId))
      setActiveAlignmentMapId(alignmentTargetMaps[0].id)
  }, [activeAlignmentMapId, alignmentTargetMaps])

  useEffect(() => {
    setAlignmentView(DEFAULT_ALIGNMENT_VIEW)
  }, [alignmentMode, referenceMapId])

  useEffect(() => {
    if (alignmentMode !== 'visual-lift')
      return

    orderedSelectedMaps.forEach((map) => {
      const mapImagePath = getMapImagePath(map)
      if (!mapImagePath)
        return

      const existing = mapImagesRef.current[map.id]
      if (existing || loadingMapImageIdsRef.current.has(map.id))
        return

      loadingMapImageIdsRef.current.add(map.id)
      setMapImagesById(prev => ({
        ...prev,
        [map.id]: {
          status: 'loading',
          width: map.info.width,
          height: map.info.height,
        },
      }))

      void (async () => {
        try {
          const blob = await apiServer.downloadMap(mapImagePath)
          const pngBlob = await convertMapRasterToPngBlob(new Uint8Array(await blob.arrayBuffer()))
          const url = URL.createObjectURL(pngBlob)
          if (!isMountedRef.current || !selectedMapIdsRef.current.has(map.id)) {
            URL.revokeObjectURL(url)
            return
          }

          setMapImagesById((prev) => {
            const previous = prev[map.id]
            if (previous?.url)
              URL.revokeObjectURL(previous.url)

            return {
              ...prev,
              [map.id]: {
                status: 'ready',
                width: map.info.width,
                height: map.info.height,
                url,
              },
            }
          })
        }
        catch (error) {
          if (!isMountedRef.current || !selectedMapIdsRef.current.has(map.id))
            return

          setMapImagesById(prev => ({
            ...prev,
            [map.id]: {
              status: 'error',
              width: map.info.width,
              height: map.info.height,
              error: `${error}`,
            },
          }))
        }
        finally {
          loadingMapImageIdsRef.current.delete(map.id)
        }
      })()
    })
  }, [alignmentMode, orderedSelectedMaps])

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
      setSelectedLiftIds(prev => removeMapValue(prev, mapId))
      setMapTransformsById(prev => removeMapValue(prev, mapId))
      setAlignmentConfirmationsByMapId(prev => removeMapValue(prev, mapId))
      if (mapId === referenceMapId) {
        setMapTransformsById({})
        setAlignmentConfirmationsByMapId({})
      }
      loadingMapImageIdsRef.current.delete(mapId)
      setMapImagesById((prev) => {
        const existing = prev[mapId]
        if (existing?.url)
          URL.revokeObjectURL(existing.url)

        return removeMapValue(prev, mapId)
      })
      setLoadingProfileIds(prev => prev.filter(id => id !== mapId))
    }
  }

  const trimmedTargetHost = targetHost.trim()
  const uploadEndpointPreview = formatRmfUploadEndpoint(targetHost)
  const getSelectedLiftForMap = (map: MapListItem) => {
    const profile = selectedProfilesByMapId.get(map.id)
    const selectedLiftId = selectedLiftIds[map.id]
    return profile?.data.lifts.find(lift => lift.uid === selectedLiftId)
  }
  const getReadyMapImage = (map: MapListItem) => {
    const image = mapImagesById[map.id]
    return image?.status === 'ready' && image.url ? image : undefined
  }
  const getMapTransform = (map: MapListItem, lift: NavLift): MapTransform => {
    const existing = mapTransformsById[map.id]
    if (existing)
      return existing

    const targetImage = getReadyMapImage(map)
    if (!referenceMap || !referenceLift || !targetImage)
      return { x: 0, y: 0, rotation: 0 }

    return getDefaultMapTransform(referenceMap, referenceLift, map, lift, targetImage)
  }
  const activeAlignmentMap = alignmentTargetMaps.find(map => map.id === activeAlignmentMapId)
  const activeAlignmentLift = activeAlignmentMap ? getSelectedLiftForMap(activeAlignmentMap) : undefined
  const referenceImage = referenceMap ? getReadyMapImage(referenceMap) : undefined
  const activeAlignmentImage = activeAlignmentMap ? getReadyMapImage(activeAlignmentMap) : undefined
  const activeAlignmentTransform = activeAlignmentMap && activeAlignmentLift
    ? getMapTransform(activeAlignmentMap, activeAlignmentLift)
    : undefined
  const referenceLiftCorners = referenceMap && referenceLift
    ? getLiftPixelCorners(referenceLift, referenceMap)
    : undefined
  const activeLiftCorners = activeAlignmentMap && activeAlignmentLift
    ? getLiftPixelCorners(activeAlignmentLift, activeAlignmentMap)
    : undefined
  const getAlignmentConfirmationSignature = (map: MapListItem) => {
    if (!referenceMap || !referenceLift || !referenceImage || map.id === referenceMap.id)
      return null

    const lift = getSelectedLiftForMap(map)
    const image = getReadyMapImage(map)
    if (!lift || !image)
      return null

    const transform = getMapTransform(map, lift)
    return [
      referenceMap.id,
      referenceLift.uid,
      referenceImage.width,
      referenceImage.height,
      map.id,
      lift.uid,
      image.width,
      image.height,
      formatDraftValue(transform.x),
      formatDraftValue(transform.y),
      formatDraftValue(transform.rotation),
    ].join('|')
  }
  const isTargetAlignmentConfirmed = (map: MapListItem) => {
    const signature = getAlignmentConfirmationSignature(map)
    return signature != null && alignmentConfirmationsByMapId[map.id] === signature
  }
  const confirmedAlignmentTargetCount = alignmentTargetMaps.filter(isTargetAlignmentConfirmed).length
  const unconfirmedAlignmentTargetCount = Math.max(0, alignmentTargetMaps.length - confirmedAlignmentTargetCount)
  const visualLevelAlignmentConfirmed = alignmentMode !== 'visual-lift'
    || orderedSelectedMaps.length < 2
    || (alignmentTargetMaps.length > 0 && unconfirmedAlignmentTargetCount === 0)
  const visualLiftAlignmentReady = alignmentMode !== 'visual-lift'
    || orderedSelectedMaps.length < 2
    || (
      referenceMap != null
      && referenceLift != null
      && orderedSelectedMaps.every(map => getReadyMapImage(map) != null)
      && orderedSelectedMaps.every(map => getSelectedLiftForMap(map) != null)
    )
  const canConfirm = !isSubmitting
    && trimmedTargetHost.length > 0
    && orderedSelectedMaps.length > 0
    && visualLiftAlignmentReady
    && visualLevelAlignmentConfirmed
    && orderedSelectedMaps.every((map) => {
      const profiles = profilesByMapId[map.id]
      const selectedProfileId = selectedProfileIds[map.id]

      return profiles != null
        && profiles.length > 0
        && selectedProfileId != null
        && profiles.some(profile => profile.uid === selectedProfileId)
    })

  const handleLiftChange = (map: MapListItem, liftUid: string) => {
    setSelectedLiftIds(prev => ({
      ...prev,
      [map.id]: liftUid,
    }))
    setMapTransformsById({})
    setAlignmentConfirmationsByMapId({})
  }

  const updateMapTransform = (mapId: number, transform: MapTransform) => {
    setMapTransformsById(prev => ({
      ...prev,
      [mapId]: transform,
    }))
    setAlignmentConfirmationsByMapId(prev => removeMapValue(prev, mapId))
  }

  const resetMapTransform = (map: MapListItem, lift: NavLift) => {
    setMapTransformsById((prev) => {
      const next = { ...prev }
      const image = getReadyMapImage(map)
      if (!referenceMap || !referenceLift || !image) {
        delete next[map.id]
        return next
      }

      next[map.id] = getDefaultMapTransform(referenceMap, referenceLift, map, lift, image)
      return next
    })
    setAlignmentConfirmationsByMapId(prev => removeMapValue(prev, map.id))
  }

  const handleAlignmentModeChange = (mode: AlignmentMode) => {
    setAlignmentMode(mode)
    setAlignmentConfirmationsByMapId({})
  }

  const handleReferenceMapChange = (mapId: number) => {
    setReferenceMapId(mapId)
    setMapTransformsById({})
    setAlignmentConfirmationsByMapId({})
  }

  const confirmActiveAlignmentMap = () => {
    if (!activeAlignmentMap)
      return

    const signature = getAlignmentConfirmationSignature(activeAlignmentMap)
    if (!signature) {
      toast.error('请先选择目标 level、电梯，并等待地图图片加载完成')
      return
    }

    const nextConfirmations = {
      ...alignmentConfirmationsByMapId,
      [activeAlignmentMap.id]: signature,
    }
    setAlignmentConfirmationsByMapId(nextConfirmations)

    const nextUnconfirmedMap = alignmentTargetMaps.find((map) => {
      if (map.id === activeAlignmentMap.id)
        return false

      const mapSignature = getAlignmentConfirmationSignature(map)
      return mapSignature != null && nextConfirmations[map.id] !== mapSignature
    })

    if (nextUnconfirmedMap)
      setActiveAlignmentMapId(nextUnconfirmedMap.id)
  }

  const zoomAlignmentView = (factor: number) => {
    setAlignmentView(prev => normalizeAlignmentView({
      ...prev,
      zoom: prev.zoom * factor,
    }))
  }

  const panAlignmentView = (directionX: number, directionY: number) => {
    const referenceSize = Math.max(referenceImage?.width ?? referenceMap?.info.width ?? 100, referenceImage?.height ?? referenceMap?.info.height ?? 100)
    setAlignmentView((prev) => {
      const normalizedView = normalizeAlignmentView(prev)
      const step = referenceSize * 0.08 / normalizedView.zoom

      return normalizeAlignmentView({
        ...normalizedView,
        panX: normalizedView.panX + directionX * step,
        panY: normalizedView.panY + directionY * step,
      })
    })
  }

  const centerAlignmentViewOnReferenceLift = () => {
    if (!referenceMap || !referenceLiftCorners) {
      setAlignmentView(DEFAULT_ALIGNMENT_VIEW)
      return
    }

    const center = getPointCenter(referenceLiftCorners)
    setAlignmentView(prev => normalizeAlignmentView({
      ...prev,
      panX: center.x - referenceMap.info.width / 2,
      panY: center.y - referenceMap.info.height / 2,
    }))
  }

  const resetAlignmentView = () => {
    setAlignmentView(DEFAULT_ALIGNMENT_VIEW)
  }

  const createVisualMapAlignment = (): ExportRmfAlignment | undefined => {
    if (alignmentMode !== 'visual-lift' || orderedSelectedMaps.length < 2)
      return null

    if (!referenceMap || !referenceLift || !referenceImage || !referenceLiftCorners) {
      toast.error('请选择参考 level、电梯，并等待地图图片加载完成')
      return undefined
    }

    if (unconfirmedAlignmentTargetCount > 0) {
      toast.error('请先确认所有目标 level 的对齐结果')
      return undefined
    }

    const referenceMapCorners = getLiftRectangleCorners(referenceLift)
    const measurementDistance = Math.hypot(
      referenceMapCorners[1].x - referenceMapCorners[0].x,
      referenceMapCorners[1].y - referenceMapCorners[0].y,
    )
    const levels = orderedSelectedMaps.map((map) => {
      const lift = getSelectedLiftForMap(map)
      const image = getReadyMapImage(map)
      if (!lift)
        return null

      if (!image)
        return null

      if (map.id === referenceMap.id) {
        return {
          levelName: map.name,
          liftUid: lift.uid,
          imageTransform: { x: 0, y: 0, rotation: 0 },
          fiducials: referenceLiftCorners,
          measurementVertices: [referenceLiftCorners[0], referenceLiftCorners[1]],
        }
      }

      const transform = getMapTransform(map, lift)
      const fiducials = referenceLiftCorners
        .map(point => inverseTransformMapPoint(point, image, transform)) as [PixelPoint, PixelPoint, PixelPoint, PixelPoint]

      return {
        levelName: map.name,
        liftUid: lift.uid,
        imageTransform: transform,
        fiducials,
        measurementVertices: [fiducials[0], fiducials[1]],
      }
    })

    if (levels.some(level => level == null)) {
      toast.error('每个 level 都需要选择电梯并完成地图图片加载')
      return undefined
    }

    return {
      method: 'visual-map',
      referenceLevelName: referenceMap.name,
      measurementDistance,
      levels: levels.filter((level): level is RmfVisualMapAlignmentOptions['levels'][number] => level != null),
    }
  }

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

    const alignment = createVisualMapAlignment()
    if (alignment === undefined)
      return

    onConfirm(selections, trimmedTargetHost, alignment)
  }

  const handleClose = () => {
    if (!isSubmitting)
      onClose()
  }

  return (
    <div
      className="fixed z-100 top-0 left-0 right-0 bottom-0 flex flex-(justify-center items-center) bg-gray-900/30"
      onClick={handleClose}>
      <div
        className="flex flex-col border-(solid 1px gray-300) shadow-md w-64rem max-w-90vw min-h-24rem max-h-85vh p-4 bg-white rounded-2xl"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-end text-3">
          <span className="text-5 font-bold mr-3">上传导航图</span>
          <span className="text-gray-500">选择地图层和对应部署配置</span>
          <div
            className="i-material-symbols-cancel-outline-rounded flex-self-center ml-a text-5"
            onClick={handleClose} />
        </div>
        <div className="mt-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-600">
          level 名称使用地图名称，可以同时勾选多个地图并合并上传；对应地图图片会以 PNG 一起上传，并同步更新 fleet 参考坐标。
        </div>
        <div className="mt-3 rounded-xl border-(solid 1px gray-200) p-3">
          <label className="block text-sm font-bold mb-2">上传目标 IP / Host</label>
          <input
            className="w-full box-border bg-gray-50 border-(solid 1px gray-300) rounded-lg px-3 py-2 text-sm"
            value={targetHost}
            disabled={isSubmitting}
            placeholder="192.168.12.1"
            onChange={event => setTargetHost(event.target.value)} />
          <div className="mt-2 text-xs text-gray-500">
            上传接口: {uploadEndpointPreview}
          </div>
        </div>
        <div className="mt-3 rounded-xl border-(solid 1px gray-200) p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="font-bold">地图对齐</div>
            <select
              className="bg-gray-50 border-(solid 1px gray-300) text-sm rounded-lg px-2 py-1"
              value={alignmentMode}
              disabled={isSubmitting}
              onChange={event => handleAlignmentModeChange(event.target.value as AlignmentMode)}>
              <option value="metadata">地图元数据</option>
              <option value="visual-lift">电梯可视对齐</option>
            </select>
            {alignmentMode === 'visual-lift' && orderedSelectedMaps.length >= 2 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">参考 level</span>
                <select
                  className="bg-gray-50 border-(solid 1px gray-300) text-sm rounded-lg px-2 py-1"
                  value={referenceMapId}
                  disabled={isSubmitting}
                  onChange={event => handleReferenceMapChange(Number(event.target.value))}>
                  {orderedSelectedMaps.map(map => (
                    <option key={map.id} value={map.id}>{map.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {alignmentMode === 'visual-lift' && orderedSelectedMaps.length < 2 && (
            <div className="mt-2 text-sm text-gray-500">需要至少两个 level 才能生成对齐标定。</div>
          )}
          {alignmentMode === 'visual-lift' && orderedSelectedMaps.length >= 2 && (
            <div className="mt-3 grid grid-cols-[minmax(0,1.8fr)_minmax(16rem,0.8fr)] gap-3">
              <div className="min-w-0">
                {referenceImage && referenceLiftCorners && (
                  <MapAlignmentPreview
                    referenceImage={referenceImage}
                    referenceCorners={referenceLiftCorners}
                    targetImage={activeAlignmentImage}
                    targetCorners={activeLiftCorners}
                    targetTransform={activeAlignmentTransform}
                    view={alignmentView}
                    disabled={isSubmitting || !activeAlignmentMap}
                    onViewChange={setAlignmentView}
                    onTargetTransformChange={(transform) => {
                      if (activeAlignmentMap)
                        updateMapTransform(activeAlignmentMap.id, transform)
                    }} />
                )}
                {(!referenceImage || !referenceLiftCorners) && (
                  <div className="h-92 rounded-lg bg-gray-50 border-(solid 1px gray-200) flex flex-(items-center justify-center) text-sm text-gray-500">
                    正在加载参考地图...
                  </div>
                )}
              </div>
              <div className="min-w-0 max-h-92 overflow-auto pr-1">
                <div className="rounded-lg border-(solid 1px gray-200) p-3 mb-3">
                  <label className="block text-xs text-gray-500 mb-1">目标 level</label>
                  <select
                    className="w-full bg-gray-50 border-(solid 1px gray-300) text-sm rounded-lg p-2"
                    value={activeAlignmentMapId}
                    disabled={isSubmitting}
                    onChange={event => setActiveAlignmentMapId(Number(event.target.value))}>
                    {alignmentTargetMaps.map(map => (
                      <option key={map.id} value={map.id}>{map.name}</option>
                    ))}
                  </select>
                  <div className="mt-3 border-t-(solid 1px gray-200) pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">视图缩放</span>
                      <span className="text-xs text-gray-500">{`${Math.round(alignmentView.zoom * 100)}%`}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        title="缩小"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => zoomAlignmentView(1 / 1.25)}>
                        <div className="i-material-symbols-zoom-out-rounded text-4" />
                      </button>
                      <button
                        type="button"
                        title="放大"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => zoomAlignmentView(1.25)}>
                        <div className="i-material-symbols-zoom-in-rounded text-4" />
                      </button>
                      <button
                        type="button"
                        title="居中到电梯"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={centerAlignmentViewOnReferenceLift}>
                        <div className="i-material-symbols-center-focus-strong-rounded text-4" />
                      </button>
                      <button
                        type="button"
                        title="重置视图"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={resetAlignmentView}>
                        <div className="i-material-symbols-fit-screen-rounded text-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 w-25">
                      <div />
                      <button
                        type="button"
                        title="上移视图"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => panAlignmentView(0, -1)}>
                        <div className="i-material-symbols-keyboard-arrow-up-rounded text-4" />
                      </button>
                      <div />
                      <button
                        type="button"
                        title="左移视图"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => panAlignmentView(-1, 0)}>
                        <div className="i-material-symbols-keyboard-arrow-left-rounded text-4" />
                      </button>
                      <button
                        type="button"
                        title="居中到电梯"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={centerAlignmentViewOnReferenceLift}>
                        <div className="i-material-symbols-center-focus-strong-rounded text-4" />
                      </button>
                      <button
                        type="button"
                        title="右移视图"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => panAlignmentView(1, 0)}>
                        <div className="i-material-symbols-keyboard-arrow-right-rounded text-4" />
                      </button>
                      <div />
                      <button
                        type="button"
                        title="下移视图"
                        className="h-7 w-7 border-none bg-gray-100 hover:bg-gray-200 rounded-md flex flex-(items-center justify-center) text-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => panAlignmentView(0, 1)}>
                        <div className="i-material-symbols-keyboard-arrow-down-rounded text-4" />
                      </button>
                      <div />
                    </div>
                  </div>
                  <div className="mt-3 border-t-(solid 1px gray-200) pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">对齐确认</span>
                      <span className={`text-xs ${unconfirmedAlignmentTargetCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {`${confirmedAlignmentTargetCount}/${alignmentTargetMaps.length}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`mt-2 w-full border-none px-3 py-2 rounded-md text-xs ${activeAlignmentMap && isTargetAlignmentConfirmed(activeAlignmentMap) ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'} disabled:opacity-50`}
                      disabled={isSubmitting || !activeAlignmentMap || !activeAlignmentLift || !activeAlignmentImage || !activeAlignmentTransform}
                      onClick={confirmActiveAlignmentMap}>
                      {activeAlignmentMap && isTargetAlignmentConfirmed(activeAlignmentMap) ? '已确认，重新确认当前 level' : '确认当前 level 对齐'}
                    </button>
                    {unconfirmedAlignmentTargetCount > 0 && (
                      <div className="mt-2 text-xs text-amber-600">
                        还有 {unconfirmedAlignmentTargetCount} 个目标 level 需要确认，确认后会自动切到下一个。
                      </div>
                    )}
                  </div>
                  {activeAlignmentMap && activeAlignmentLift && activeAlignmentTransform && (
                    <>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <DraftNumberField
                          label="X"
                          value={activeAlignmentTransform.x}
                          step={1}
                          disabled={isSubmitting}
                          onChange={value => updateMapTransform(activeAlignmentMap.id, { ...activeAlignmentTransform, x: value })} />
                        <DraftNumberField
                          label="Y"
                          value={activeAlignmentTransform.y}
                          step={1}
                          disabled={isSubmitting}
                          onChange={value => updateMapTransform(activeAlignmentMap.id, { ...activeAlignmentTransform, y: value })} />
                        <DraftNumberField
                          label="Yaw"
                          value={activeAlignmentTransform.rotation}
                          step={1}
                          disabled={isSubmitting}
                          onChange={value => updateMapTransform(activeAlignmentMap.id, { ...activeAlignmentTransform, rotation: value })} />
                      </div>
                      <button
                        className="mt-2 border-none bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md text-xs"
                        disabled={isSubmitting}
                        onClick={() => resetMapTransform(activeAlignmentMap, activeAlignmentLift)}>
                        重置
                      </button>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {orderedSelectedMaps.map((map) => {
                    const profile = selectedProfilesByMapId.get(map.id)
                    const lifts = profile?.data.lifts ?? []
                    const selectedLiftId = selectedLiftIds[map.id] ?? ''
                    const isReference = map.id === referenceMapId
                    const isConfirmed = !isReference && isTargetAlignmentConfirmed(map)
                    const image = mapImagesById[map.id]

                    return (
                      <div key={map.id} className="rounded-lg border-(solid 1px gray-200) p-3 bg-white">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="font-medium truncate">{map.name}</div>
                          {isReference && (
                            <span className="ml-a text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5">参考</span>
                          )}
                          {!isReference && (
                            <span className={`ml-a text-xs rounded px-2 py-0.5 ${isConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {isConfirmed ? '已确认' : '待确认'}
                            </span>
                          )}
                        </div>
                        {lifts.length === 0 && (
                          <div className="text-sm text-red-500">该部署配置没有电梯。</div>
                        )}
                        {lifts.length > 0 && (
                          <select
                            className="w-full bg-gray-50 border-(solid 1px gray-300) text-sm rounded-lg p-2"
                            value={selectedLiftId}
                            disabled={isSubmitting}
                            onChange={event => handleLiftChange(map, event.target.value)}>
                            {lifts.map(lift => (
                              <option key={lift.uid} value={lift.uid}>{getLiftLabel(lift)}</option>
                            ))}
                          </select>
                        )}
                        <div className={`mt-2 text-xs ${image?.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                          {image?.status === 'ready' && `${image.width} x ${image.height}`}
                          {image?.status === 'loading' && '地图图片加载中...'}
                          {image?.status === 'error' && `地图图片加载失败 ${image.error}`}
                          {!image && '等待地图图片加载'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
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
                    <div className="text-xs text-gray-500 mb-2">{`上传为 level: ${map.name}`}</div>
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
            disabled={isSubmitting}
            onClick={handleClose}>
            取消
          </button>
          <button
            className={`border-none px-4 py-2 rounded-lg text-sm ${canConfirm ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}
            disabled={!canConfirm}
            onClick={handleConfirm}>
            {isSubmitting ? '上传中...' : '上传'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportRmfModal
