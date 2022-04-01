const { BrowserProvider } = require('@filecoin-shipyard/lotus-client-provider-browser')
const WebSocket = require('ws')
const fetch = require('node-fetch')

class NodejsProvider extends BrowserProvider {
  constructor (url, options = {}) {
    super(url, {
      WebSocket,
      fetch,
      ...options
    })
  }
}

module.exports = { NodejsProvider }
