import { Link, Outlet } from 'react-router-dom'

const Home: React.FC = () => {
  return (
    <div className="flex h-full">
      <div className="flex flex-col w-40 bg-gray-100 pt-3rem border-(r-solid 1px gray-3)">
        <nav>
          <Link to="/deployment" className="block p-1 text-center text-gray-5 hover:bg-gray-3">Deployment</Link>
        </nav>
        <Link to="/settings" className="flex flex-(items-center justify-center) text-gray-5 mt-a py-4 decoration-none border-(t-solid 1px gray-3)">
          <div className="i-material-symbols-settings-rounded mr-2" />
          <div className="text-4">Settings</div>
        </Link>
        <div>
        </div>
      </div>
      <Outlet />
    </div>
  )
}

export default Home
