import { useMemo, useState } from 'react'
import Input from './Input'
import { useLocales } from '@/hooks'
import { useParamsStore } from '@/store'
import { isValidIpv4, normalizeNestControllerIp } from '@/util/nestController'

interface NestControllerStartupProps {
  onConnected: () => void
}

const NestControllerStartup: React.FC<NestControllerStartupProps> = ({ onConnected }) => {
  const { locale } = useLocales()
  const {
    nestControllerIp,
    nestControllerHistory,
    rememberNestControllerIp,
    updateApiDomain,
    updateWsDomain,
    updateIsGetDomainAuto,
  } = useParamsStore(state => ({
    nestControllerIp: state.nestControllerIp,
    nestControllerHistory: state.nestControllerHistory,
    rememberNestControllerIp: state.rememberNestControllerIp,
    updateApiDomain: state.updateApiDomain,
    updateWsDomain: state.updateWsDomain,
    updateIsGetDomainAuto: state.updateIsGetDomainAuto,
  }))
  const initialIp = useMemo(() => nestControllerIp || nestControllerHistory[0] || '', [nestControllerHistory, nestControllerIp])
  const [ip, setIp] = useState(initialIp)
  const [error, setError] = useState('')

  const connect = (value: string) => {
    const normalizedIp = normalizeNestControllerIp(value)

    if (!isValidIpv4(normalizedIp)) {
      setError(locale('nestControllerInvalidIp'))
      return
    }

    rememberNestControllerIp(normalizedIp)
    updateApiDomain(`http://${normalizedIp}:5000`)
    updateWsDomain(`ws://${normalizedIp}:1234`)
    updateIsGetDomainAuto(false)
    onConnected()
  }

  return (
    <main className="min-h-screen flex flex-col bg-gray-100 text-gray-800">
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <form
          className="w-full max-w-150 border-(solid 1px gray-3) bg-white p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault()
            connect(ip)
          }}>
          <h1 className="m-0 text-6 font-600">
            {locale('nestControllerTitle')}
          </h1>
          <p className="mb-6 mt-2 text-sm text-gray-500">
            {locale('nestControllerSubtitle')}
          </p>

          <label className="mb-2 block text-sm font-600" htmlFor="nest-controller-ip">
            {locale('nestControllerIp')}
          </label>
          <div className="flex gap-2">
            <Input
              id="nest-controller-ip"
              className="min-w-0 flex-1"
              inputMode="decimal"
              autoFocus
              value={ip}
              onChange={(event) => {
                setIp(event.target.value)
                setError('')
              }}
              placeholder="10.148.165.8" />
            <button
              className="border-(solid 1px blue-700) bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
              type="submit">
              {locale('nestControllerConnect')}
            </button>
          </div>
          {error && (
            <p className="mb-0 mt-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <section className="mt-6 border-(t-solid 1px gray-2) pt-4">
            <div className="mb-3 text-sm font-600">
              {locale('nestControllerHistory')}
            </div>
            {nestControllerHistory.length > 0
              ? (
                  <div className="flex flex-wrap gap-2">
                    {nestControllerHistory.map(historyIp => (
                      <button
                        key={historyIp}
                        className="border-(solid 1px gray-4) bg-gray-50 px-3 py-1 text-sm hover:bg-gray-2"
                        type="button"
                        onClick={() => connect(historyIp)}>
                        {historyIp}
                      </button>
                    ))}
                  </div>
                )
              : (
                  <div className="text-sm text-gray-400">
                    {locale('nestControllerNoHistory')}
                  </div>
                )}
          </section>
        </form>
      </div>
    </main>
  )
}

export default NestControllerStartup
