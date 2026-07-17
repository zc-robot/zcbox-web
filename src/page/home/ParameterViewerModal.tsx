import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildParameterSections, filterParameterSections, humanizeParameterKey, updateParameterValue } from './parameterModel'
import type { ParameterNumericType, ParameterPrimitive, ParameterValue, ParameterValueKind, RobotParameter } from './parameterModel'
import apiServer from '@/service/apiServer'
import { useLocales } from '@/hooks'

interface ParameterViewerModalProps {
  onClose: () => void
}

function getParameterTypeLabel(kind: ParameterValueKind, numericType: ParameterNumericType | undefined, locale: (key: string) => string) {
  if (numericType === 'integer')
    return locale(kind === 'list' ? 'parameterTypeIntegerList' : 'parameterTypeInteger')
  if (numericType === 'double')
    return locale(kind === 'list' ? 'parameterTypeDoubleList' : 'parameterTypeDouble')

  const labels: Record<ParameterValueKind, string> = {
    boolean: locale('parameterTypeBoolean'),
    number: locale('parameterTypeNumber'),
    text: locale('parameterTypeText'),
    list: locale('parameterTypeList'),
    empty: locale('parameterTypeEmpty'),
  }
  return labels[kind]
}

function parameterDraft(value: ParameterValue) {
  if (Array.isArray(value))
    return JSON.stringify(value)
  if (value == null)
    return ''
  return String(value)
}

function isParameterPrimitive(value: unknown): value is ParameterPrimitive {
  return value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function parseParameterDraft(parameter: RobotParameter, draft: string, locale: (key: string) => string): ParameterValue {
  if (parameter.kind === 'boolean')
    return draft === 'true'

  if (parameter.kind === 'number') {
    if (!draft.trim())
      throw new Error(locale('parameterInvalidNumber'))
    const number = Number(draft)
    if (!Number.isFinite(number))
      throw new Error(locale('parameterInvalidNumber'))
    if (parameter.numericType === 'integer' && !Number.isInteger(number))
      throw new Error(locale('parameterInvalidInteger'))
    return number
  }

  if (parameter.kind === 'list') {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    }
    catch {
      throw new Error(locale('parameterInvalidList'))
    }
    if (!Array.isArray(parsed) || !parsed.every(isParameterPrimitive))
      throw new Error(locale('parameterInvalidList'))
    if (parameter.numericType === 'integer' && parsed.some(value => typeof value === 'number' && !Number.isInteger(value)))
      throw new Error(locale('parameterInvalidIntegerList'))
    return parsed
  }

  return draft
}

function ParameterEditor({
  parameter,
  locale,
  onSave,
}: {
  parameter: RobotParameter
  locale: (key: string) => string
  onSave: (parameter: RobotParameter, value: ParameterValue) => Promise<void>
}) {
  const initialDraft = useMemo(() => parameterDraft(parameter.value), [parameter.value])
  const [draft, setDraft] = useState(initialDraft)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const dirty = draft !== initialDraft

  useEffect(() => {
    setDraft(initialDraft)
    setError('')
  }, [initialDraft])

  const updateDraft = (value: string) => {
    setDraft(value)
    setStatus('idle')
    setError('')
  }

  const save = async () => {
    if (!dirty || status === 'saving')
      return

    setStatus('saving')
    setError('')
    try {
      const value = parseParameterDraft(parameter, draft, locale)
      await onSave(parameter, value)
      setStatus('saved')
    }
    catch (cause) {
      setStatus('error')
      setError(cause instanceof Error && cause.message ? cause.message : locale('parameterSaveFailed'))
    }
  }

  const controlClass = 'w-full rounded-lg border-(solid 1px slate-300) bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-3 focus:ring-teal-100 disabled:cursor-wait disabled:bg-slate-50'

  return (
    <form
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}>
      {parameter.kind === 'boolean'
        ? (
            <select
              className={controlClass}
              aria-label={parameter.label}
              disabled={status === 'saving'}
              value={draft}
              onChange={event => updateDraft(event.target.value)}>
              <option value="true">{locale('parameterEnabled')}</option>
              <option value="false">{locale('parameterDisabled')}</option>
            </select>
          )
        : parameter.kind === 'number'
          ? (
              <input
                className={`${controlClass} font-mono`}
                aria-label={parameter.label}
                disabled={status === 'saving'}
                inputMode={parameter.numericType === 'integer' ? 'numeric' : 'decimal'}
                step={parameter.numericType === 'integer' ? 1 : 'any'}
                type="number"
                value={draft}
                onChange={event => updateDraft(event.target.value)} />
            )
          : (
              <textarea
                className={`${controlClass} resize-y ${parameter.kind === 'list' ? 'font-mono text-xs' : ''}`}
                aria-label={parameter.label}
                disabled={status === 'saving'}
                rows={parameter.kind === 'list' ? 3 : 2}
                value={draft}
                onChange={event => updateDraft(event.target.value)} />
            )}

      <div className="mt-2 flex min-h-8 items-center justify-between gap-3">
        <div className="min-w-0 text-xs">
          {status === 'saved' && (
            <span className="inline-flex items-center gap-1 font-700 text-emerald-600">
              <span className="i-material-symbols-check-circle-rounded text-4" />
              {locale('parameterSaved')}
            </span>
          )}
          {status === 'error' && <span className="block break-words text-rose-600">{error}</span>}
        </div>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-800 text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          type="submit"
          disabled={!dirty || status === 'saving'}>
          <span className={`${status === 'saving' ? 'i-material-symbols-progress-activity-rounded animate-spin' : 'i-material-symbols-save-rounded'} text-4`} />
          {status === 'saving' ? locale('parameterSaving') : locale('parameterSave')}
        </button>
      </div>
    </form>
  )
}

const ParameterViewerModal: React.FC<ParameterViewerModalProps> = ({ onClose }) => {
  const { locale } = useLocales()
  const [heads, setHeads] = useState<string[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [headQuery, setHeadQuery] = useState('')
  const [parameterQuery, setParameterQuery] = useState('')
  const [loadingHeads, setLoadingHeads] = useState(true)
  const [loadingParameters, setLoadingParameters] = useState(false)
  const [headsError, setHeadsError] = useState(false)
  const [parameterError, setParameterError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [selectedHead, setSelectedHead] = useState<string | null>(null)
  const parameterRequestId = useRef(0)

  const loadHeads = useCallback(async () => {
    parameterRequestId.current += 1
    setLoadingHeads(true)
    setHeadsError(false)
    setParameterError(false)
    setSelectedHead(null)
    setSource(null)
    setParameterQuery('')
    setUpdatedAt(null)
    try {
      setHeads(await apiServer.fetchRobotParameterHeads())
    }
    catch (cause) {
      console.error('Unable to load robot parameter heads.', cause)
      setHeadsError(true)
    }
    finally {
      setLoadingHeads(false)
    }
  }, [])

  const loadParametersForHead = useCallback(async (head: string) => {
    const requestId = parameterRequestId.current + 1
    parameterRequestId.current = requestId
    setSelectedHead(head)
    setSource(null)
    setParameterQuery('')
    setParameterError(false)
    setLoadingParameters(true)
    try {
      const content = await apiServer.fetchRobotParametersByHeads([head])
      buildParameterSections(content)
      if (parameterRequestId.current !== requestId)
        return
      setSource(content)
      setUpdatedAt(new Date())
    }
    catch (cause) {
      if (parameterRequestId.current !== requestId)
        return
      console.error(`Unable to load robot parameter head: ${head}`, cause)
      setParameterError(true)
    }
    finally {
      if (parameterRequestId.current === requestId)
        setLoadingParameters(false)
    }
  }, [])

  const saveParameter = useCallback(async (parameter: RobotParameter, value: ParameterValue) => {
    if (!source)
      throw new Error('Robot parameters are not loaded.')

    // Validate the path before sending a change to the controller.
    updateParameterValue(source, parameter.pathSegments, value, parameter.numericType)
    await apiServer.updateRobotParameter(parameter.path, value, parameter.numericType)
    setSource((current) => {
      if (!current)
        return current
      try {
        return updateParameterValue(current, parameter.pathSegments, value, parameter.numericType)
      }
      catch {
        return current
      }
    })
    setUpdatedAt(new Date())
  }, [source])

  useEffect(() => {
    void loadHeads()
  }, [loadHeads])

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
  const filteredHeads = useMemo(() => {
    const normalizedQuery = headQuery.trim().toLocaleLowerCase()
    if (!normalizedQuery)
      return heads
    return heads.filter((head) => {
      const label = humanizeParameterKey(head)
      return `${head} ${label}`.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [headQuery, heads])
  const selectedSection = useMemo(
    () => sections.find(section => section.key === selectedHead) ?? null,
    [sections, selectedHead],
  )
  const visibleParameters = useMemo(() => {
    if (!selectedSection)
      return []
    if (!parameterQuery.trim())
      return selectedSection.parameters
    return filterParameterSections([selectedSection], parameterQuery)[0]?.parameters ?? []
  }, [parameterQuery, selectedSection])

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
                  {locale('robotParametersEditable')}
                </span>
              </div>
              <p className="mb-0 mt-1.5 text-sm text-slate-300">{locale('robotParametersSubtitle')}</p>
              {heads.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
                  <span className="rounded-full bg-white/8 px-2.5 py-1">{heads.length} {locale('robotParametersSections')}</span>
                  {selectedSection && (
                    <span className="rounded-full bg-white/8 px-2.5 py-1">{selectedSection.parameters.length} {locale('robotParametersValues')}</span>
                  )}
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
              <span className="sr-only">{locale('robotParameterHeadsSearchPlaceholder')}</span>
              <span className="i-material-symbols-search-rounded pointer-events-none absolute left-3 top-2.5 text-5 text-slate-400" />
              <input
                className="w-full rounded-xl border-(solid 1px slate-300) bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-3 focus:ring-teal-100"
                autoFocus
                type="search"
                value={headQuery}
                placeholder={locale('robotParameterHeadsSearchPlaceholder')}
                onChange={event => setHeadQuery(event.target.value)} />
              {headQuery && (
                <button
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-none bg-transparent text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  type="button"
                  aria-label={locale('robotParametersClearSearch')}
                  onClick={() => setHeadQuery('')}>
                  <span className="i-material-symbols-cancel-outline-rounded text-4.5" />
                </button>
              )}
            </label>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border-(solid 1px slate-300) bg-white px-4 py-2.5 text-sm font-700 text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-wait disabled:opacity-60"
              type="button"
              disabled={loadingHeads || loadingParameters}
              onClick={loadHeads}>
              <span className={`i-material-symbols-refresh-rounded text-5 ${loadingHeads ? 'animate-spin' : ''}`} />
              {loadingHeads ? locale('robotParametersRefreshing') : locale('robotParametersRefresh')}
            </button>
          </div>
          {heads.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              {locale('robotParametersShowing')} {filteredHeads.length} / {heads.length} {locale('robotParametersSections')}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loadingHeads && <ParameterLoadingState locale={locale} />}
          {headsError && (
            <ParameterErrorState
              locale={locale}
              onRetry={() => { loadHeads() }} />
          )}
          {!loadingHeads && !headsError && heads.length === 0 && (
            <EmptyState
              icon="i-material-symbols-inbox-rounded"
              title={locale('robotParametersEmptyTitle')}
              body={locale('robotParametersEmptyBody')} />
          )}
          {!loadingHeads && !headsError && heads.length > 0 && (
            <div className="grid items-start gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
              <aside className="overflow-hidden rounded-2xl border-(solid 1px slate-200) bg-white shadow-sm md:sticky md:top-0">
                <div className="border-b-(solid 1px slate-200) bg-slate-50 px-4 py-3">
                  <h3 className="m-0 text-sm font-800 text-slate-800">{locale('robotParameterGroupsTitle')}</h3>
                  <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">{locale('robotParameterGroupsHint')}</p>
                </div>
                <nav
                  className="max-h-[calc(92vh-22rem)] min-h-64 overflow-y-auto p-2"
                  aria-label={locale('robotParameterGroupsTitle')}>
                  {filteredHeads.length > 0
                    ? (
                        <div className="space-y-1">
                          {filteredHeads.map((head) => {
                            const selected = head === selectedHead
                            const label = humanizeParameterKey(head)
                            return (
                              <button
                                key={head}
                                className={`group flex w-full items-center gap-3 rounded-xl border-none px-3 py-2.5 text-left transition ${selected ? 'bg-teal-600 text-white shadow-sm' : 'bg-transparent text-slate-700 hover:bg-slate-100'}`}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => { loadParametersForHead(head) }}>
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-white/15 text-teal-50' : 'bg-slate-100 text-slate-500 group-hover:bg-white'}`}>
                                  <span className={`${selected && loadingParameters ? 'i-material-symbols-progress-activity-rounded animate-spin' : 'i-material-symbols-folder-open-rounded'} text-4.5`} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-mono text-xs font-800">{head}</span>
                                  {label.toLocaleLowerCase() !== head.toLocaleLowerCase() && (
                                    <span className={`mt-0.5 block truncate text-[11px] ${selected ? 'text-teal-100' : 'text-slate-400'}`}>{label}</span>
                                  )}
                                </span>
                                <span className={`${selected ? 'i-material-symbols-chevron-right-rounded text-white' : 'i-material-symbols-chevron-right-rounded text-slate-300'} shrink-0 text-5`} />
                              </button>
                            )
                          })}
                        </div>
                      )
                    : (
                        <div className="px-3 py-12 text-center text-sm text-slate-400">
                          {locale('robotParameterNoHeadsMatch')}
                        </div>
                      )}
                </nav>
              </aside>

              <div className="min-w-0">
                {!selectedHead && (
                  <div className="rounded-2xl border-(solid 1px slate-200) bg-white shadow-sm">
                    <EmptyState
                      icon="i-material-symbols-touch-app-rounded"
                      title={locale('robotParameterSelectTitle')}
                      body={locale('robotParameterSelectBody')} />
                  </div>
                )}

                {selectedHead && loadingParameters && (
                  <div className="rounded-2xl border-(solid 1px slate-200) bg-white px-5 shadow-sm">
                    <ParameterLoadingState locale={locale} />
                  </div>
                )}

                {selectedHead && parameterError && !loadingParameters && (
                  <div className="rounded-2xl border-(solid 1px slate-200) bg-white shadow-sm">
                    <ParameterErrorState
                      locale={locale}
                      onRetry={() => { loadParametersForHead(selectedHead) }} />
                  </div>
                )}

                {selectedSection && !loadingParameters && !parameterError && (
                  <article className="overflow-hidden rounded-2xl border-(solid 1px slate-200) bg-white shadow-sm">
                    <div className="flex flex-wrap items-center gap-3 border-b-(solid 1px slate-100) bg-gradient-to-r from-slate-50 to-white px-4 py-3.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                        <span className="i-material-symbols-tune-rounded text-5.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="m-0 truncate text-base font-800 text-slate-800">{selectedSection.label}</h3>
                        <div className="truncate font-mono text-xs text-slate-400">{selectedSection.key}</div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-700 text-slate-500">
                        {visibleParameters.length} / {selectedSection.parameters.length}
                      </span>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-lg border-(solid 1px slate-200) bg-white text-slate-500 hover:border-teal-300 hover:text-teal-700"
                        type="button"
                        title={locale('robotParametersRefresh')}
                        aria-label={locale('robotParametersRefresh')}
                        onClick={() => { loadParametersForHead(selectedSection.key) }}>
                        <span className="i-material-symbols-refresh-rounded text-4.5" />
                      </button>
                      <label className="relative w-full basis-full">
                        <span className="sr-only">{locale('robotParametersSearchPlaceholder')}</span>
                        <span className="i-material-symbols-search-rounded pointer-events-none absolute left-3 top-2.5 text-5 text-slate-400" />
                        <input
                          className="w-full rounded-xl border-(solid 1px slate-300) bg-white py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-3 focus:ring-teal-100"
                          type="search"
                          value={parameterQuery}
                          placeholder={locale('robotParametersSearchPlaceholder')}
                          onChange={event => setParameterQuery(event.target.value)} />
                        {parameterQuery && (
                          <button
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-none bg-transparent text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                            type="button"
                            aria-label={locale('robotParametersClearSearch')}
                            onClick={() => setParameterQuery('')}>
                            <span className="i-material-symbols-cancel-outline-rounded text-4.5" />
                          </button>
                        )}
                      </label>
                    </div>

                    {visibleParameters.length > 0
                      ? (
                          <div className="grid grid-cols-1 gap-px bg-slate-100 xl:grid-cols-2">
                            {visibleParameters.map(parameter => (
                              <div key={parameter.path} className="min-w-0 bg-white p-4 transition hover:bg-slate-50/80">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 text-sm font-800 text-slate-700">{parameter.label}</div>
                                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-800 uppercase tracking-wide text-slate-500">
                                    {getParameterTypeLabel(parameter.kind, parameter.numericType, locale)}
                                  </span>
                                </div>
                                <ParameterEditor parameter={parameter} locale={locale} onSave={saveParameter} />
                                <div className="mt-2 break-all font-mono text-[11px] leading-4 text-slate-400">{parameter.path}</div>
                              </div>
                            ))}
                          </div>
                        )
                      : (
                          <EmptyState
                            icon="i-material-symbols-search-off-rounded"
                            title={locale('robotParametersNoMatchesTitle')}
                            body={locale('robotParametersNoMatchesBody')} />
                        )}
                  </article>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ParameterErrorState({ locale, onRetry }: { locale: (key: string) => string; onRetry: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
        <span className="i-material-symbols-cloud-off-rounded text-9" />
      </div>
      <h3 className="mb-0 mt-4 text-lg font-800 text-slate-800">{locale('robotParametersErrorTitle')}</h3>
      <p className="mb-0 mt-2 max-w-lg text-sm leading-6 text-slate-500">{locale('robotParametersErrorBody')}</p>
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-700 text-white hover:bg-slate-800"
        type="button"
        onClick={onRetry}>
        <span className="i-material-symbols-refresh-rounded text-5" />
        {locale('robotParametersRetry')}
      </button>
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
