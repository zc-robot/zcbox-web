import React from "react"
import { useGridStore, useOperationStore } from "@/store"

const Panel: React.FC = () => {
  const zoom = useGridStore((state) => state.zoom)
  const fetchMapGrid = useGridStore((state) => state.fetchMapGrid)
  const fetchRobotData = useGridStore((state) => state.fetchRobotPose)
  const currentOp = useOperationStore((state) => state.current)
  const updateOp = useOperationStore((state) => state.update)

  const zoomInClick = () => zoom(1.1)
  const zoomOutClick = () => zoom(0.9)

  return (
    <div panel-container>
      <div flex>
        <div
          className={currentOp === "move" ? "panel-item-enabled" : "panel-item"}
          onClick={() => updateOp("move")}>
          <div i-material-symbols:back-hand-outline-rounded panel-icon />
        </div>
        <div
          className={currentOp === "select" ? "panel-item-enabled" : "panel-item"}
          onClick={() => updateOp("select")}>
          <div i-material-symbols:near-me-outline-rounded panel-icon rotate-y-180 />
        </div>
        <div
          className={currentOp === "waypoint" ? "panel-item-enabled" : "panel-item"}
          onClick={() => updateOp("waypoint")}>
          <div i-material-symbols:my-location-outline-rounded panel-icon />
        </div>
        <div
          className={currentOp === "pathway" ? "panel-item-enabled" : "panel-item"}
          onClick={() => updateOp("pathway")}>
          <div i-material-symbols:edit-road-outline-rounded panel-icon />
        </div>
      </div>
      <div flex>
        <div panel-item
          onClick={zoomInClick}>
          <div i-material-symbols:zoom-in-rounded panel-icon />
        </div>
        <div panel-item
          onClick={zoomOutClick}>
          <div i-material-symbols:zoom-out-rounded panel-icon />
        </div>
        <div panel-item
          onClick={async () => {
            await fetchMapGrid()
          }}>
          <div i-material-symbols:map-outline-rounded panel-icon />
        </div>
        <div panel-item
          onClick={async () => {
            await fetchRobotData()
          }}>
          <div i-material-symbols:smart-toy-outline-rounded panel-icon />
        </div>
      </div>
    </div>
  )
}

export default Panel
