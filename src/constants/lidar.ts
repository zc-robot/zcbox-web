export const LIDAR_SCAN_TOPICS = [
  { topic: 'scan/filtered', label: 'S1', color: 'rgba(14, 165, 233, 0.85)' },
  { topic: 'scan2', label: 'S2', color: 'rgba(16, 185, 129, 0.85)' },
  { topic: 'scan3', label: 'S3', color: 'rgba(245, 158, 11, 0.85)' },
] as const

export const DEFAULT_LIDAR_SCAN_TOPIC = LIDAR_SCAN_TOPICS[0].topic
export const DEFAULT_LIDAR_SCAN_TOPICS = LIDAR_SCAN_TOPICS.map(({ topic }) => topic)

export function resolveLidarScanTopic(source?: string | null) {
  const normalized = (source ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (!normalized)
    return DEFAULT_LIDAR_SCAN_TOPIC

  return DEFAULT_LIDAR_SCAN_TOPICS.find(topic => normalized === topic || normalized.endsWith(`/${topic}`)) ?? normalized
}

export function getLidarScanColor(topic: string) {
  return LIDAR_SCAN_TOPICS.find(item => item.topic === topic)?.color ?? 'rgba(14, 165, 233, 0.85)'
}
