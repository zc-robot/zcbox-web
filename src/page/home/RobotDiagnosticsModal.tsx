import { useEffect, useMemo, useState } from 'react'
import { buildRobotHardwareDiagnosticsView } from '../fleet/runtimeModel'
import type { FleetHardwareDiagnosticState } from '../fleet/runtimeModel'
import { useRobotHardwareDiagnosticsZenoh } from '@/hooks/useRobotHardwareDiagnosticsZenoh'
import { useLocales } from '@/hooks'

interface RobotDiagnosticsModalProps {
  onClose: () => void
}

function getDiagnosticTone(state: FleetHardwareDiagnosticState) {
  if (state === 'normal')
    return 'bg-emerald-100 text-emerald-800'
  if (state === 'warning')
    return 'bg-amber-100 text-amber-800'
  if (state === 'fault')
    return 'bg-rose-100 text-rose-800'
  if (state === 'stale')
    return 'bg-violet-100 text-violet-800'
  return 'bg-slate-100 text-slate-600'
}

function getDiagnosticLabel(state: FleetHardwareDiagnosticState) {
  return state.charAt(0).toUpperCase() + state.slice(1)
}

const RobotDiagnosticsModal: React.FC<RobotDiagnosticsModalProps> = ({ onClose }) => {
  const { locale } = useLocales()
  const stream = useRobotHardwareDiagnosticsZenoh()
  const [showNormal, setShowNormal] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const view = useMemo(
    () => buildRobotHardwareDiagnosticsView(stream.diagnostics, stream.updatedAt, showNormal, now),
    [now, showNormal, stream.diagnostics, stream.updatedAt],
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        onClose()
    }
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const connectionLabel = stream.connected
    ? locale('robotDiagnosticsLive')
    : stream.error
      ? locale('robotDiagnosticsUnavailable')
      : locale('robotDiagnosticsConnecting')
  const connectionClass = stream.connected
    ? 'bg-emerald-400/15 text-emerald-100'
    : stream.error
      ? 'bg-rose-400/15 text-rose-100'
      : 'bg-amber-400/15 text-amber-100'
  const updatedLabel = stream.updatedAt
    ? new Date(stream.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : locale('robotDiagnosticsNotReceived')

  return (
    <div
      className="fixed inset-0 z-120 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section
        className="flex max-h-[92vh] w-[68rem] max-w-[96vw] flex-col overflow-hidden rounded-3xl border-(solid 1px slate-200) bg-slate-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="robot-diagnostics-title"
        onMouseDown={event => event.stopPropagation()}>
        <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-6 py-5 text-white">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-cyan-400/15 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-(solid 1px white/15) bg-white/10 shadow-inner">
              <div className="i-material-symbols-health-and-safety-outline-rounded text-7 text-cyan-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="robot-diagnostics-title" className="m-0 text-6 font-800 tracking-tight">
                  {locale('robotDiagnostics')}
                </h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-700 ${connectionClass}`}>
                  {connectionLabel}
                </span>
              </div>
              <p className="mb-0 mt-1.5 text-sm text-slate-300">{locale('robotDiagnosticsSubtitle')}</p>
              <div className="mt-3 text-xs text-slate-300">
                {locale('robotDiagnosticsUpdated')} {updatedLabel}
              </div>
            </div>
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-(solid 1px white/10) bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white"
              type="button"
              title={locale('robotDiagnosticsClose')}
              aria-label={locale('robotDiagnosticsClose')}
              onClick={onClose}>
              <div className="i-material-symbols-close-rounded text-6" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {stream.error && (
            <div className="mb-4 rounded-xl border-(solid 1px rose-200) bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {locale('robotDiagnosticsErrorBody')}
            </div>
          )}

          {!stream.diagnostics && (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                <span className={`i-material-symbols-monitor-heart-outline-rounded text-9 ${stream.error ? '' : 'animate-pulse'}`} />
              </div>
              <h3 className="mb-0 mt-4 text-lg font-800 text-slate-800">{locale('robotDiagnosticsWaitingTitle')}</h3>
              <p className="mb-0 mt-2 max-w-lg text-sm leading-6 text-slate-500">{locale('robotDiagnosticsWaitingBody')}</p>
            </div>
          )}

          {stream.diagnostics && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-(solid 1px slate-200) bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-800 ${getDiagnosticTone(view.summary.state)}`}>
                    {getDiagnosticLabel(view.summary.state)}
                  </span>
                  <span>{view.summary.abnormalCount} {locale('robotDiagnosticsAbnormal')}</span>
                  <span className="text-slate-300">·</span>
                  <span>{view.summary.totalCount} {locale('robotDiagnosticsTotal')}</span>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-700 text-slate-700">
                  <input
                    type="checkbox"
                    checked={showNormal}
                    onChange={event => setShowNormal(event.target.checked)}
                  />
                  {locale('robotDiagnosticsShowNormal')}
                </label>
              </div>

              {view.groups.length === 0 && (
                <div className="rounded-2xl border-(solid 1px emerald-200) bg-emerald-50 px-4 py-10 text-center text-sm font-700 text-emerald-700">
                  {locale('robotDiagnosticsAllNormal')}
                </div>
              )}

              {view.groups.length > 0 && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {view.groups.map(group => (
                    <section key={group.id} className="overflow-hidden rounded-2xl border-(solid 1px slate-200) bg-white shadow-sm">
                      <div className="flex items-center justify-between gap-3 border-b-(solid 1px slate-100) bg-slate-50 px-4 py-3">
                        <h3 className="m-0 text-base font-800 text-slate-800">{group.title}</h3>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-800 text-slate-600">{group.items.length}</span>
                      </div>
                      <div className="space-y-3 p-3">
                        {group.items.map(item => (
                          <article key={item.id} className="rounded-xl border-(solid 1px slate-100) bg-slate-50/80 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-800 text-slate-800">{item.label}</div>
                                <div className="mt-1 text-xs leading-5 text-slate-500">{item.message || '--'}</div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-800 ${getDiagnosticTone(item.state)}`}>
                                {getDiagnosticLabel(item.state)}
                              </span>
                            </div>
                            {item.values.length > 0 && (
                              <dl className="mb-0 mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                {item.values.map(value => (
                                  <div key={`${item.id}-${value.label}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                                    <dt className="truncate text-slate-500">{value.label}</dt>
                                    <dd className="m-0 shrink-0 font-700 tabular-nums text-slate-800">{value.value || '--'}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default RobotDiagnosticsModal
