import React from "react"
import { useAppDispatch } from "@/store"
import { zoom } from "@/store/grid"

const Panel: React.FC = () => {
  const dispatch = useAppDispatch()

  const zoomInClick = () => {
    dispatch(zoom(1.1))
  }
  const zoomOutClick = () => {
    dispatch(zoom(0.9))
  }

  return (
    <div bg-gray-100 h-3rem flex="~ items-center">
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
