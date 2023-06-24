import { useBoundStore } from '@/store'

type wsType = 'map' | 'robot_data' | 'velocity_control'
type wsState = 'connected' | 'disconnected' | 'error'

class Websocket {
  private client: WebSocket
  get domain() {
    let d = useBoundStore.getState().wsDomain
    if (d === '')
      d = import.meta.env.VITE_WS_DOMAIN || 'ws://localhost:1234'

    if (!d.endsWith('/'))
      d = `${d}/`
    return d
  }

  private constructor(path: string, cb?: (state: wsState, data: string) => void) {
    this.client = new WebSocket(this.domain + path)

    if (cb) {
      this.client.onopen = () => {
        cb('connected', '')
      }
      this.client.onmessage = (data) => {
        cb('connected', data.data)
      }
      this.client.onerror = (event) => {
        console.error(`ws connect ${path} failed:`, event)
        cb('error', '')
      }
      this.client.onclose = (event) => {
        console.error(`ws connect ${path} closed:`, event.code, event.reason)
        cb('disconnected', '')
      }
    }
  }

  static connect = (type: wsType, cb?: (state: wsState, data: string) => void) => {
    return new Websocket(type, cb)
  }

  send = (data: any) => {
    this.client.send(JSON.stringify(data))
  }

  close = () => {
    console.error('ws close')
    this.client.close()
  }
}

export default Websocket
