import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildParameterSections, filterParameterSections } from './parameterModel'
import type { ParameterPrimitive, ParameterValueKind, RobotParameter } from './parameterModel'
import apiServer from '@/service/apiServer'
import { useLocales } from '@/hooks'

interface ParameterViewerModalProps {
  onClose: () => void
}

function getParameterTypeLabel(kind: ParameterValueKind, locale: (key: string) => string) {
  const labels: Record<ParameterValueKind, string> = {
    boolean: locale('parameterTypeBoolean'),
    number: locale('parameterTypeNumber'),
    text: locale('parameterTypeText'),
    list: locale('parameterTypeList'),
    empty: locale('parameterTypeEmpty'),
  }
  return labels[kind]
}

function ParameterValueView({ parameter, locale }: { parameter: RobotParameter; locale: (key: string) => string }) {
  if (parameter.kind === 'boolean') {
    const enabled = parameter.value === true
    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-700 ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        {enabled ? locale('parameterEnabled') : locale('parameterDisabled')}
      </span>
    )
  }

  if (parameter.kind === 'empty')
    return <span className="text-sm italic text-slate-400">{locale('parameterNotSet')}</span>

  if (Array.isArray(parameter.value)) {
    if (parameter.value.length === 0)
      return <span className="text-sm italic text-slate-400">{locale('parameterEmptyList')}</span>

    return (
      <div className="flex flex-wrap gap-1.5">
        {parameter.value.map((item, index) => (
          <span
            key={`${parameter.path}-${index}`}
            className="max-w-full break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
            {formatValue(item)}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className={`break-words text-sm text-slate-800 ${parameter.kind === 'number' ? 'font-mono font-700 text-teal-800' : ''}`}>
      {formatValue(parameter.value)}
    </div>
  )
}

function formatValue(value: ParameterPrimitive) {
  if (value == null)
    return '—'
  return String(value)
}

const ParameterViewerModal: React.FC<ParameterViewerModalProps> = ({ onClose }) => {
  const { locale } = useLocales()
  const [source, setSource] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const loadParameters = useCallback(async () => {
    setLoading(true)
    setHasError(false)
    try {
      const content = await apiServer.fetchAllRobotParameters()
      buildParameterSections(content)
      setSource(content)
      setUpdatedAt(new Date())
    }
    catch (cause) {
      console.error('Unable to load robot parameters.', cause)
      setHasError(true)
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadParameters()
  }, [loadParameters])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const sections = useMemo(() => {
    if (!source)
      return []
    return buildParameterSections(source)
  }, [source])
  const filteredSections = useMemo(() => filterParameterSections(sections, query), [query, sections])
  const parameterCount = useMemo(
    () => sections.reduce((total, section) => total + section.parameters.length, 0),
    [sections],
  )
  const visibleParameterCount = useMemo(
    () => filteredSections.reduce((total, section) => total + section.parameters.length, 0),
    [filteredSections],
  )

  return (
    <div
      className="fixed inset-0 z-120 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section
        className="flex max-h-92vh w-68rem max-w-96vw flex-col overflow-hidden rounded-3xl border-(solid 1px slate-200) bg-slate-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="robot-parameters-title"
        onMouseDown={event => event.stopPropagation()}>
        <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-6 py-5 text-white">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-teal-400/15 blur-2xl" />
          <div className="pointer-events-none absolute bottom--20 left-30 h-36 w-36 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-(solid 1px white/15) bg-white/10 shadow-inner">
              <div className="i-material-symbols-tune-rounded text-7 text-teal-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="robot-parameters-title" className="m-0 text-6 font-800 tracking-tight">{locale('robotParameters')}</h2>
                <span className="rounded-full border-(solid 1px teal-300/30) bg-teal-300/10 px-2.5 py-1 text-xs font-700 text-teal-100">
                  {locale('robotParametersReadOnly')}
                </span>
              </div>
              <p className="mb-0 mt-1.5 text-sm text-slate-300">{locale('robotParametersSubtitle')}</p>
              {parameterCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
                  <span className="rounded-full bg-white/8 px-2.5 py-1">{sections.length} {locale('robotParametersSections')}</span>
                  <span className="rounded-full bg-white/8 px-2.5 py-1">{parameterCount} {locale('robotParametersValues')}</span>
                  {updatedAt && (
                    <span className="rounded-full bg-white/8 px-2.5 py-1">
                      {locale('robotParametersLastUpdated')} {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-(solid 1px white/10) bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white"
              type="button"
              title={locale('robotParametersClose')}
              aria-label={locale('robotParametersClose')}
              onClick={onClose}>
              <div className="i-material-symbols-close-rounded text-6" />
            </button>
          </div>
        </header>

        <div className="shrink-0 border-b-(solid 1px slate-200) bg-white px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">{locale('robotParametersSearchPlaceholder')}</span>
              <span className="i-material-symbols-search-rounded pointer-events-none absolute left-3 top-2.5 text-5 text-slate-400" />
              <input
                className="w-full rounded-xl border-(solid 1px slate-300) bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-3 focus:ring-teal-100"
                autoFocus
                type="search"
                value={query}
                placeholder={locale('robotParametersSearchPlaceholder')}
                onChange={event => setQuery(event.target.value)} />
              {query && (
                <button
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-none bg-transparent text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  type="button"
                  aria-label={locale('robotParametersClearSearch')}
                  onClick={() => setQuery('')}>
                  <span className="i-material-symbols-cancel-outline-rounded text-4.5" />
                </button>
              )}
            </label>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border-(solid 1px slate-300) bg-white px-4 py-2.5 text-sm font-700 text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-wait disabled:opacity-60"
              type="button"
              disabled={loading}
              onClick={loadParameters}>
              <span className={`i-material-symbols-refresh-rounded text-5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? locale('robotParametersRefreshing') : locale('robotParametersRefresh')}
            </button>
          </div>
          {parameterCount > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              {locale('robotParametersShowing')} {visibleParameterCount} / {parameterCount}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading && !source && <ParameterLoadingState locale={locale} />}
          {hasError && (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <span className="i-material-symbols-cloud-off-rounded text-9" />
              </div>
              <h3 className="mb-0 mt-4 text-lg font-800 text-slate-800">{locale('robotParametersErrorTitle')}</h3>
              <p className="mb-0 mt-2 max-w-lg text-sm leading-6 text-slate-500">{locale('robotParametersErrorBody')}</p>
              <button
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-700 text-white hover:bg-slate-800"
                type="button"
                onClick={loadParameters}>
                <span className="i-material-symbols-refresh-rounded text-5" />
                {locale('robotParametersRetry')}
              </button>
            </div>
          )}
          {!loading && !hasError && sections.length === 0 && (
            <EmptyState
              icon="i-material-symbols-inbox-rounded"
              title={locale('robotParametersEmptyTitle')}
              body={locale('robotParametersEmptyBody')} />
          )}
          {!hasError && sections.length > 0 && filteredSections.length === 0 && (
            <EmptyState
              icon="i-material-symbols-search-off-rounded"
              title={locale('robotParametersNoMatchesTitle')}
              body={locale('robotParametersNoMatchesBody')} />
          )}
          {!hasError && filteredSections.length > 0 && (
            <div className="space-y-4">
              {filteredSections.map((section, sectionIndex) => (
                <article key={section.key} className="overflow-hidden rounded-2xl border-(solid 1px slate-200) bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b-(solid 1px slate-100) bg-gradient-to-r from-slate-50 to-white px-4 py-3.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${sectionIndex % 3 === 0 ? 'bg-teal-100 text-teal-700' : sectionIndex % 3 === 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                      <span className="i-material-symbols-folder-open-rounded text-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="m-0 truncate text-base font-800 text-slate-800">{section.label}</h3>
                      {section.key !== 'general' && <div className="truncate font-mono text-xs text-slate-400">{section.key}</div>}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-700 text-slate-500">{section.parameters.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-px bg-slate-100 md:grid-cols-2">
                    {section.parameters.map(parameter => (
                      <div key={parameter.path} className="min-w-0 bg-white p-4 transition hover:bg-slate-50/80">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 text-sm font-800 text-slate-700">{parameter.label}</div>
                          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-800 uppercase tracking-wide text-slate-500">
                            {getParameterTypeLabel(parameter.kind, locale)}
                          </span>
                        </div>
                        <div className="mt-2 min-h-7"><ParameterValueView parameter={parameter} locale={locale} /></div>
                        <div className="mt-2 break-all font-mono text-[11px] leading-4 text-slate-400">{parameter.path}</div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ParameterLoadingState({ locale }: { locale: (key: string) => string }) {
  return (
    <div className="py-5">
      <div className="mb-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
          <span className="i-material-symbols-sync-rounded animate-spin text-8" />
        </div>
        <h3 className="mb-0 mt-3 text-base font-800 text-slate-800">{locale('robotParametersLoadingTitle')}</h3>
        <p className="mb-0 mt-1 text-sm text-slate-500">{locale('robotParametersLoadingBody')}</p>
      </div>
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map(index => (
          <div key={index} className="overflow-hidden rounded-2xl border-(solid 1px slate-200) bg-white p-4">
            <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="h-18 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-18 animate-pulse rounded-xl bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <span className={`${icon} text-9`} />
      </div>
      <h3 className="mb-0 mt-4 text-lg font-800 text-slate-800">{title}</h3>
      <p className="mb-0 mt-2 max-w-md text-sm leading-6 text-slate-500">{body}</p>
    </div>
  )
}

export default ParameterViewerModal
