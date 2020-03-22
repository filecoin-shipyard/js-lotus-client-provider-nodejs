export default class BrowserProvider {
  constructor (url, options = {}) {
    this.url = url
    this.httpUrl = url.replace(/^wss:/, 'https:' )
    this.id = 0
    this.inflight = new Map()
    this.subscriptions = new Map()
    this.token = options.token
  }

  connect () {
    if (!this.connectPromise) {
      this.connectPromise = new Promise((resolve, reject) => {
        this.ws = new WebSocket(this.url)
        // FIXME: reject on error or timeout
        this.ws.onopen = function () {
          resolve()
        }
        this.ws.onmessage = this.receive.bind(this)
      })
    }
    return this.connectPromise
  }

  send (request, schemaMethod) {
    const jsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.id++,
      ...request
    }
    if (schemaMethod.perm === 'write') {
      return this.sendHttp(jsonRpcRequest)
    } else {
      return this.sendWs(jsonRpcRequest)
    }
  }

  async sendHttp (jsonRpcRequest) {
    const headers = {
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: '*/*'
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }
    try {
      const response = await fetch(this.httpUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(jsonRpcRequest)
      })
      // FIXME: Check return code, errors
      const { result } = await response.json()
      return result
    } catch (e) {
      throw e
    }
  }

  sendWs (jsonRpcRequest) {
    const promise = new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(jsonRpcRequest))
      // FIXME: Add timeout
      this.inflight.set(jsonRpcRequest.id, (err, result) => {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })
    return promise
  }

  sendSubscription (request, schemaMethod, subscriptionCb) {
    let chanId = null
    const json = {
      jsonrpc: '2.0',
      id: this.id++,
      ...request
    }
    const promise = new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(json))
      // FIXME: Add timeout
      this.inflight.set(json.id, (err, result) => {
        chanId = result
        this.subscriptions.set(chanId, subscriptionCb)
        if (err) {
          reject(err)
        } else {
          resolve(cancel)
        }
      })
    })
    return promise
    function cancel () {
      this.inflight.delete(json.id)
      if (chanId !== null) {
        this.subscriptions.delete(chanId)
      }
      // FIXME: Send cancel message to Lotus?
    }
  }

  receive (event) {
    try {
      const {
        id,
        result,
        method,
        params
      } = JSON.parse(event.data)
      // FIXME: JSON-RPC errors?
      if (method === 'xrpc.ch.val') {
        const [chanId, data] = params
        const subscriptionCb = this.subscriptions.get(chanId)
        if (subscriptionCb) {
          subscriptionCb(data)
        } else {
          console.warn('Could not find subscription for channel', chanId)
        }
      } else {
        const cb = this.inflight.get(id)
        if (cb) {
          this.inflight.delete(id)
          cb(null, result)
        }
      }
    } catch (e) {
      console.error('RPC receive error', e)
    }
  }

  close () {
    if (this.ws) {
      this.ws.close()
    }
  }
}