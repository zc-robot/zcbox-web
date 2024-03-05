import React, { useEffect } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import Deployment from './deployment'
import Home from './home'
import NotFound from './404'
import Settings from './settings'
import Default from './home/Default'
import Mapping from './mapping'
import { useParamsStore } from '@/store'
import apiServer from '@/service/apiServer'

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
  const { updateRobotParams, updatePointActions } = useParamsStore(state => ({
    updateRobotParams: state.updateRobotParams,
    updatePointActions: state.updatePointActions,
  }))
  const updateApiDomain = useParamsStore(state => state.updateApiDomain)
  const updateWsDomain = useParamsStore(state => state.updateWsDomain)

  useEffect(() => {
    const currentUrl = window.location.href
    const url = new URL(currentUrl)
    const host = url.hostname
    const wsDomain = `ws://${host}:1234`
    const apiDomain = `http://${host}:1234`
    updateApiDomain(apiDomain)
    updateWsDomain(wsDomain)
    const fetchParams = async () => {
      const params = await apiServer.fetchParams()
      if (params)
        updateRobotParams(params)
      const actions = await apiServer.fetchActions()
      if (actions)
        updatePointActions(actions)
    }
    fetchParams()
  }, [updatePointActions, updateRobotParams])

  return (
    <RouterProvider router={router} />
  )
}

export default App
