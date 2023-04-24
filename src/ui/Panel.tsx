import React from "react"
import { useGridStore } from "@/store"

const Panel: React.FC = () => {
  const zoom = useGridStore((state) => state.zoom)

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)
  const fetchMapGrid = useGridStore((state) => state.fetchMapGrid)
  const fetchRobotData = useGridStore((state) => state.fetchRobotPose)

  return (
    <div bg-gray-100 h-3rem flex="~ items-center">
      <button
        onClick={async () => {
          await fetchMapGrid()
        }}>获取地图信息</button>
      <button
        onClick={async () => {
          await fetchRobotData()
        }}>获取机器人信息</button>
      <button>移动</button>
      <button
        onClick={zoomInClick}>
        ZoomIn
      </button>
      <button
        onClick={zoomOutClick}>
        ZoomOut
      </button>
      <button>添加路径点</button>
      <button>修改路径点</button>
    </div>
  )
}

export default Panel
