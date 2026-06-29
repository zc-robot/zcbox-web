import React, { useEffect } from 'react'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import Deployment from './deployment'
import FleetView from './fleet'
import Home from './home'
import NotFound from './404'
import Settings from './settings'
import Default from './home/Default'
import Mapping from './mapping'
import NestControllerStartup from '@/components/NestControllerStartup'
import { useParamsStore } from '@/store'
import apiServer from '@/service/apiServer'
import { isValidIpv4, normalizeNestControllerIp } from '@/util/nestController'
import type { AppMode } from '@/types'

const router = createHashRouter([
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
        path: 'mapping',
        element: <Mapping />,
      },
      {
        path: 'deployment/:mapId',
        element: <Deployment />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
])

const App: React.FC = () => {
  const [isControllerReady, setIsControllerReady] = React.useState(false)
  const { updateRobotParams, updatePointActions } = useParamsStore(state => ({
    updateRobotParams: state.updateRobotParams,
    updatePointActions: state.updatePointActions,
  }))
  const isGetDomainAuto = useParamsStore(state => state.isGetDomainAuto)
  const updateApiDomain = useParamsStore(state => state.updateApiDomain)
  const updateWsDomain = useParamsStore(state => state.updateWsDomain)
  const updateIsGetDomainAuto = useParamsStore(state => state.updateIsGetDomainAuto)
  const nestControllerIp = useParamsStore(state => state.nestControllerIp)
  const apiDomain = useParamsStore(state => state.apiDomain)
  const appMode = useParamsStore(state => state.appMode)

  useEffect(() => {
    if (isControllerReady)
      return

    if (!appMode)
      return

    const normalizedIp = normalizeNestControllerIp(nestControllerIp)
    if (!isValidIpv4(normalizedIp))
      return

    updateApiDomain(`http://${normalizedIp}:5000`)
    updateWsDomain(`ws://${normalizedIp}:1234`)
    updateIsGetDomainAuto(false)
    setIsControllerReady(true)
  }, [appMode, isControllerReady, nestControllerIp, updateApiDomain, updateIsGetDomainAuto, updateWsDomain])

  useEffect(() => {
    if (!isControllerReady)
      return

    const normalizedIp = normalizeNestControllerIp(nestControllerIp)
    if (!appMode || !isValidIpv4(normalizedIp))
      setIsControllerReady(false)
  }, [appMode, isControllerReady, nestControllerIp])

  useEffect(() => {
    if (!isControllerReady)
      return

    if (appMode !== 'robot')
      return

    if (isGetDomainAuto) {
      const isFileProtocol = window.location.protocol === 'file:'
      const host = window.location.hostname || import.meta.env.VITE_DESKTOP_HOST || '127.0.0.1'
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const wsDomain = isFileProtocol && import.meta.env.VITE_WS_DOMAIN
        ? import.meta.env.VITE_WS_DOMAIN
        : `${wsProtocol}://${host}:1234`
      const apiDomain = isFileProtocol && import.meta.env.VITE_API_DOMAIN
        ? import.meta.env.VITE_API_DOMAIN
        : `http://${host}:5000`
      updateApiDomain(apiDomain)
      updateWsDomain(wsDomain)
    }
  }, [appMode, isControllerReady, isGetDomainAuto, updateApiDomain, updateWsDomain])

  useEffect(() => {
    if (!isControllerReady)
      return

    if (appMode !== 'robot')
      return

    const fetchParams = async () => {
      const params = await apiServer.fetchParams()
      if (params)
        updateRobotParams(params)
      const actions = await apiServer.fetchActions()
      if (actions)
        updatePointActions(actions)
    }

    // 只有当apiDomain不为空时才获取参数
    if (apiDomain)
      fetchParams()
  }, [apiDomain, appMode, isControllerReady, updatePointActions, updateRobotParams])

  if (!isControllerReady || !appMode)
    return <NestControllerStartup onConnected={(_mode: AppMode) => setIsControllerReady(true)} />

  if (appMode === 'fleet')
    return <FleetView />

  return (
    <RouterProvider router={router} />
  )
}

export default App
