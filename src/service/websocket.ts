import { useBoundStore } from '@/store'

type wsType = 'map' | 'robot_data' | 'velocity_control'
type wsState = 'connected' | 'disconnected' | 'error'

class Websocket {
  private client: WebSocket
  get domain() {
    return useBoundStore.getState().wsDomain
  }

  private constructor(path: string, cb?: (state: wsState, data: string) => void) {
    const domain = this.domain.endsWith('/') ? this.domain : `${this.domain}/`
    this.client = new WebSocket(domain + path)

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
      this.client.onclose = () => {
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
    this.client.close()
  }
}

export default Websocket
