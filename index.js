const { BrowserProvider } = require('@jimpick/lotus-client-provider-browser')
const WebSocket = require('ws')
const fetch = require('node-fetch')

class NodejsProvider extends BrowserProvider {
  constructor (url, options = {}) {
    super(url, {
      ...options,
      WebSocket,
      fetch
    })
  }
}

module.exports = { NodejsProvider }
