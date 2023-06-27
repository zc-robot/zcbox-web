import React, { useEffect } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import Deployment from './deployment'
import Home from './home'
import NotFound from './404'
import Settings from './settings'
import Default from './home/Default'
import Mapping from './mapping'
import { useParamsStore } from '@/store'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
    errorElement: <NotFound />,
    children: [
      {
        index: true,
        element: <Default />,
      },
      {
        path: '/mapping',
        element: <Mapping />,
      },
      {
        path: '/deployment/:mapId',
        element: <Deployment />,
      },
      {
        path: '/settings',
        element: <Settings />,
      },
    ],
  },
])

const App: React.FC = () => {
  const fetchParams = useParamsStore(state => state.fetchParams)

  useEffect(() => {
    fetchParams()
  }, [fetchParams])

  return (
    <RouterProvider router={router} />
  )
}

export default App
