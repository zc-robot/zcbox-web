import { useState } from 'react'
import Input from '@/components/Input'
import { useParamsStore } from '@/store'

const HostSetting: React.FC = () => {
  const apiDomain = useParamsStore(state => state.apiDomain)
  const wsDomain = useParamsStore(state => state.wsDomain)
  const updateApiDomain = useParamsStore(state => state.updateApiDomain)
  const updateWsDomain = useParamsStore(state => state.updateWsDomain)
  const [domain, setDomain] = useState({
    api: apiDomain,
    ws: wsDomain,
  })

  const handleSubmit = () => {
    updateApiDomain(domain.api)
    updateWsDomain(domain.ws)
  }

  return (
    <>
      <h3>域名配置</h3>
      <form>
        <div className="flex flex-items-center p2 gap-2">
          <span className="text-sm w-30">API域名</span>
          <Input
            className="w-50"
            type="url"
            value={domain.api}
            onChange={e => setDomain({ ...domain, api: e.target.value })}
            placeholder="http://localhost:1234" />
        </div>
        <div className="flex flex-items-center p2 gap-2">
          <span className="text-sm w-30">WS域名</span>
          <Input
            className="w-50"
            type="url"
            value={domain.ws}
            onChange={e => setDomain({ ...domain, ws: e.target.value })}
            placeholder="ws://localhost:1234" />
        </div>
      </form>
      <div
        className="bg-gray-300 p1 rounded-1 text-(sm center) cursor-default w-10"
        onClick={() => handleSubmit()}>
        保存
      </div>
    </>
  )
}

export default HostSetting
