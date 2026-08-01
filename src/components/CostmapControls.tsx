import { useGridStore } from '@/store'
import type { CostmapLayer, CostmapStatus } from '@/util/costmapModel'

interface CostmapButtonProps {
  layer: CostmapLayer
  letter: string
}

function statusLabel(status: CostmapStatus, message: string | null) {
  switch (status) {
    case 'waiting':
      return 'Waiting for data'
    case 'visible':
      return 'Visible'
    case 'no-data':
      return 'No costmap data'
    case 'stale':
      return 'Stale — showing last data'
    case 'error':
      return message || 'Error'
    default:
      return 'Off'
  }
}

function CostmapButton({ layer, letter }: CostmapButtonProps) {
  const state = useGridStore(store => store.costmaps[layer])
  const setCostmapVisibility = useGridStore(store => store.setCostmapVisibility)
  const label = layer === 'global' ? 'Global Costmap' : 'Local Costmap'
  const activeColor = layer === 'global'
    ? 'bg-amber-500 hover:bg-amber-600'
    : 'bg-cyan-500 hover:bg-cyan-600'
  const idleColor = layer === 'global' ? 'text-amber-600' : 'text-cyan-600'
  const tooltip = `${label} — ${statusLabel(state.status, state.message)}`

  return (
    <button
      type="button"
      className={`${state.visible ? `panel-item-enabled ${activeColor}` : `panel-item ${idleColor}`} group relative border-none`}
      aria-label={state.visible ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={state.visible}
      onClick={() => setCostmapVisibility(layer, !state.visible)}>
      <span className="text-sm font-bold leading-none">{letter}</span>
      {state.visible && state.status === 'waiting' && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      )}
      {state.visible && (state.status === 'no-data' || state.status === 'stale') && (
        <span className="absolute right-0.5 top-0 text-2.5 text-yellow-100">!</span>
      )}
      {state.visible && state.status === 'error' && (
        <span className="absolute right-0.5 top-0 text-2.5 text-red-100">×</span>
      )}
      <span className="pointer-events-none absolute mt-1 invisible whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-sm text-gray-100 group-hover:visible translate-y-3rem">
        {tooltip}
      </span>
    </button>
  )
}

const CostmapControls: React.FC = () => {
  if (!window.zcDesktop?.isDesktop)
    return null

  return (
    <>
      <CostmapButton layer="global" letter="G" />
      <CostmapButton layer="local" letter="L" />
    </>
  )
}

export default CostmapControls
