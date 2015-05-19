var convict = require('convict')

var config = convict(
  {
    log: {
      level: {
        format: String,
        default: 'info'
      },
      fmt: {
        format: String,
        default: 'heka'
      }
    },
    server: {
      host: {
        format: 'ipaddress',
        default: '127.0.0.1'
      },
      port: {
        format: 'port',
        default: 7980
      },
      publicUrl: {
        format: String,
        default: 'http://127.0.0.1:7980'
      }
    },
    peers: {
      content: {
        format: String,
        default: 'http://127.0.0.1:3030'
      },
      auth: {
        format: String,
        default: 'http://127.0.0.1:9000'
      }
    },

  }
)

config.loadFile('./config.json')

config.validate()

module.exports = config.root()
