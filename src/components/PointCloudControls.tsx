import type { FC } from 'react'
import PointCloud3DView from './PointCloud3DView'
import { useGridStore } from '@/store'

const PointCloudControls: FC = () => {
  const isPointCloudVisible = useGridStore(state => state.isPointCloudVisible)
  const setPointCloudVisibility = useGridStore(state => state.setPointCloudVisibility)

  const togglePointCloudVisibility = () => setPointCloudVisibility(!isPointCloudVisible)

  return (
    <>
      <div
        className={`${isPointCloudVisible ? 'panel-item-enabled' : 'panel-item'} group`}
        role="button"
        tabIndex={0}
        title={isPointCloudVisible ? '关闭点云 3D' : '打开点云 3D'}
        aria-label={isPointCloudVisible ? '关闭点云 3D' : '打开点云 3D'}
        onClick={togglePointCloudVisibility}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            togglePointCloudVisibility()
          }
        }}>
        <div className="i-material-symbols-view-in-ar-outline-rounded panel-icon" />
        <span className="z-10 group-hover:visible bg-gray-800 px-1 text-(sm gray-100) rounded-md absolute translate-y-3rem mt-1 invisible whitespace-nowrap">
          {isPointCloudVisible ? '关闭点云 3D' : '打开点云 3D'}
        </span>
      </div>
      {isPointCloudVisible && <PointCloud3DView />}
    </>
  )
}

export default PointCloudControls
