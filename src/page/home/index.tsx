import { useCallback, useEffect } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import apiServer from '@/service/apiServer'
import { useGridStore, useParamsStore } from '@/store'

const Home: React.FC = () => {
  const { maps, setMaps } = useGridStore(state => ({
    maps: state.maps,
    setMaps: state.setMaps,
  }))
  const wsDomain = useParamsStore(state => state.wsDomain)

  const initMapData = useCallback(async () => {
    const maps = await apiServer.fetchMapList()
    setMaps(maps)
  }, [setMaps])

  useEffect(() => {
    initMapData()
  }, [initMapData, wsDomain])

  return (
    <div className="flex h-full">
      <div className="flex flex-col w-40 bg-gray-100 pt-3rem border-(r-solid 1px gray-3)">
        <nav>
          <Link
            className="flex flex-(items-center justify-center) py-4 decoration-none"
            to="/mapping">
            <div className="bg-white hover:bg-gray-2 rounded border-(solid 1px gray-5) px-4 py-1 text-gray-5">建图</div>
          </Link>
          {maps.map((m, i) => {
            return <Link
              key={i}
              className="block p-1 text-center text-gray-5 hover:bg-gray-3 decoration-none"
              to={`/deployment/${m.id}`}>{`${m.name} (${m.id})`}</Link>
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
