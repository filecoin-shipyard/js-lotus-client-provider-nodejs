class BrowserProvider {
  constructor (url, options = {}) {
    this.url = url
    this.httpUrl = url.replace(/^wss:/, 'https:')
    this.id = 0
    this.inflight = new Map()
    this.subscriptions = new Map()
    this.token = options.token
    if (this.token && this.token !== '') {
      this.url += `?token=${this.token}`
    }
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
    return this.sendWs(jsonRpcRequest)
  }

  async sendHttp (jsonRpcRequest) {
    const headers = {
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: '*/*'
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }
    const response = await fetch(this.httpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonRpcRequest)
    })
    // FIXME: Check return code, errors
    const { error, result } = await response.json()
    if (error) {
      // FIXME: Return error class with error.code
      throw new Error(error.message)
    }
    return result
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
      const { id, error, result, method, params } = JSON.parse(event.data)
      // FIXME: Check return code, errors
      if (method === 'xrpc.ch.val') {
        // FIXME: Check return code, errors
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
          if (error) {
            // FIXME: Return error class with error.code
            return cb(new Error(error.message))
          }
          cb(null, result)
        } else {
          console.warn(`Couldn't find subscription for ${id}`)
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

export default BrowserProvider
