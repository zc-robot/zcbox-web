import React from 'react'
import { LIDAR_SCAN_TOPICS } from '@/constants/lidar'
import { useGridStore } from '@/store'

const LidarScanControls: React.FC = () => {
  const { selectedLidarScanTopics, setSelectedLidarScanTopics } = useGridStore(state => ({
    selectedLidarScanTopics: state.selectedLidarScanTopics,
    setSelectedLidarScanTopics: state.setSelectedLidarScanTopics,
  }))

  const toggleTopic = (topic: string) => {
    const isSelected = selectedLidarScanTopics.includes(topic)
    if (isSelected && selectedLidarScanTopics.length <= 1)
      return

    const nextTopics = isSelected
      ? selectedLidarScanTopics.filter(item => item !== topic)
      : LIDAR_SCAN_TOPICS
          .map(item => item.topic)
          .filter(item => item === topic || selectedLidarScanTopics.includes(item))

    setSelectedLidarScanTopics(nextTopics)
  }

  return (
    <>
      {LIDAR_SCAN_TOPICS.map(({ topic, label, color }) => {
        const isSelected = selectedLidarScanTopics.includes(topic)

        return (
          <div
            key={topic}
            className={`${isSelected ? 'panel-item-enabled' : 'panel-item'} group items-center justify-center gap-0.5`}
            onClick={() => toggleTopic(topic)}>
            <span
              className="h-2 w-2 rounded-full border border-white/70"
              style={{ backgroundColor: color }} />
            <span className="text-10px font-semibold leading-none">{label}</span>
            <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible whitespace-nowrap">
              {topic}
            </span>
          </div>
        )
      })}
    </>
  )
}

export default LidarScanControls
