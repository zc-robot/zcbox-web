import type { ReactNode } from 'react'
import './robot-toolbar.css'

interface RobotToolButtonProps {
  label: string
  icon: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  busy?: boolean
  tone?: 'primary' | 'upload' | 'warning'
  title?: string
}

export function RobotToolButton({ label, icon, onClick, active, disabled, busy, tone, title }: RobotToolButtonProps) {
  return (
    <button
      type="button"
      className={`robot-tool-button${active ? ' is-active' : ''}${tone ? ` is-${tone}` : ''}`}
      title={title || label}
      aria-pressed={active}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onClick}>
      <span className={busy ? 'i-material-symbols-sync-rounded animate-spin' : icon} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

export function RobotToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="robot-tool-group" role="group" aria-label={label}>
      <span className="robot-tool-group-label">{label}</span>
      <div className="robot-tool-group-actions">{children}</div>
    </div>
  )
}
