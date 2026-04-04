import type { MouseEvent } from 'react'
import { useCallback, useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'react-hot-toast'
import apiServer from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'

const Home: React.FC = () => {
  const { maps, setMaps, setMapsNew } = useGridStore(state => ({
    maps: state.maps,
    setMaps: state.setMaps,
    setMapsNew: state.setMapsNew,
  }))

  const apiDomain = useParamsStore(state => state.apiDomain)
  const location = useLocation()
  const navigate = useNavigate()

  const initMapData = useCallback(async () => {
    const maps = await apiServer.fetchMapList()
    const mapsNew = await apiServer.fetchMapListNew()

    setMaps(maps)
    setMapsNew(mapsNew)
  }, [setMaps, setMapsNew])

  useEffect(() => {
    // 只有当apiDomain不为空时才获取地图数据
    if (apiDomain) {
      // 添加小延迟确保apiServer能够正确获取到新的域名设置
      setTimeout(() => {
        initMapData()
      }, 100)
    }
  }, [initMapData, apiDomain])

  const handleDeleteMap = useCallback(async (event: MouseEvent<HTMLButtonElement>, id: number) => {
    event.preventDefault()
    event.stopPropagation()

    // eslint-disable-next-line no-alert
    const confirmed = confirm('确定删除当前选中的地图？')
    if (!confirmed)
      return

    try {
      const resp = await apiServer.deleteMap(id)
      if (resp.code !== 0) {
        toast.error(resp.message || '删除失败')
        return
      }

      await initMapData()
      if (location.pathname === `/deployment/${id}`)
        navigate('/')
      toast.success('删除成功')
    }
    catch (error) {
      toast.error(`删除失败 ${error}`)
    }
  }, [initMapData, location.pathname, navigate])

  return (
    <div className="flex h-full">
      <div className="flex flex-col w-40 bg-gray-100 border-(r-solid 1px gray-3)">
        <nav>
          <Link
            className="flex flex-(items-center justify-center) py-4 decoration-none"
            to="/mapping">
            <div className="bg-white hover:bg-gray-2 rounded border-(solid 1px gray-5) px-4 py-1 text-gray-5">建图</div>
          </Link>
          {maps.map((m, i) => {
            const isSelected = location.pathname === `/deployment/${m.id}`
            return (
              <div
                key={i}
                className={`flex items-center gap-1 pr-1 ${isSelected ? 'bg-gray-3' : 'hover:bg-gray-3'}`}>
                <NavLink
                  className={`block flex-1 p-1 text-center text-gray-5 decoration-none ${isSelected ? 'font-bold' : ''}`}
                  to={`/deployment/${m.id}`}>
                  {`${m.name} (${m.id})`}
                </NavLink>
                {isSelected && (
                  <button
                    className="flex h-6 w-6 items-center justify-center border-none bg-transparent p-0 text-gray-5"
                    title="删除地图"
                    onClick={event => handleDeleteMap(event, m.id)}>
                    <div className="i-material-symbols-delete-outline-rounded text-4" />
                  </button>
                )}
              </div>
            )
          })}
        </nav>
        <Link to="/settings" className="flex flex-(items-center justify-center) text-gray-5 mt-a py-4 decoration-none border-(t-solid 1px gray-3)">
          <div className="i-material-symbols-settings-rounded mr-2" />
          <div className="text-4">Settings</div>
        </Link>
        <div>
        </div>
      </div>
      <Outlet />
      <Toaster />
    </div>
  )
}

export default Home
