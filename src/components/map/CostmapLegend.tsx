import { useGridStore } from '@/store'

const CostmapLegend: React.FC = () => {
  const globalVisible = useGridStore(state => state.costmaps.global.visible)
  const localVisible = useGridStore(state => state.costmaps.local.visible)

  if (!window.zcDesktop?.isDesktop || (!globalVisible && !localVisible))
    return null

  return (
    <div className="pointer-events-none absolute z-20 bottom-3 right-3 min-w-34 rounded border-(solid 1px gray-300) bg-white/90 px-3 py-2 text-xs text-gray-700 shadow">
      <div className="mb-1 font-semibold">Costmap</div>
      {globalVisible && (
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
          <span>Global</span>
        </div>
      )}
      {localVisible && (
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-cyan-500" />
          <span>Local</span>
        </div>
      )}
      <div className="mt-1 flex items-center gap-2">
        <span>Low</span>
        <span
          className="h-2 flex-1 rounded-sm"
          style={{ background: 'linear-gradient(to right, rgba(75, 85, 99, 0.13), rgba(75, 85, 99, 0.88))' }} />
        <span>High</span>
      </div>
    </div>
  )
}

export default CostmapLegend
