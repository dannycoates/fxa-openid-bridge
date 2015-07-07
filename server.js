var config = require('./config')
var boom = require('boom')
var hapi = require('hapi')
var openid = require('openid')
var Pool = require('poolee')
var url = require('url')

var mozlog = require('mozlog')
mozlog.config({
  app: 'fxa-openid-bridge',
  level: config.log.level,
  fmt: config.log.fmt
})
var log = mozlog()
log.verbose('config', config)


/*/
    HTTP server configuration
/*/
var server = new hapi.Server({
  connections: {
    routes: {
      cors: true,
      state: {
        parse: false
      }
    }
  }
})

server.connection({
  host: config.server.host,
  port: config.server.port
})


server.ext(
  'onPreResponse',
  function (request, reply) {
    var status = request.response.statusCode || request.response.output.statusCode
    log.info('response', { method: request.method, path: request.path, status: status })
    reply.continue()
  }
)

var ext = [
  new openid.AttributeExchange(
    {
      "http://axschema.org/contact/email": "optional"
    }
  )
]

var rp = new openid.RelyingParty(
  config.server.publicUrl + '/verify',
  null,
  false,
  false,
  ext
  )


server.route([
  {
    method: 'GET',
    path: '/authenticate',
    config: {},
    handler: function (req, reply) {
      var identifier = req.query.identifier
      rp.authenticate(
        identifier,
        false,
        function (err, authUrl) {
          reply.redirect(authUrl)
        }
      )
    }
  },
  {
    method: 'GET',
    path: '/verify',
    config: {},
    handler: function (req, reply) {
      if (!req.url.search) {
        reply(
          '<?xml version="1.0" encoding="UTF-8"?>\n'
          + '<xrds:XRDS xmlns:xrds="xri://$xrds" xmlns="xri://$xrd*($v*2.0)"><XRD>'
          + '<Service xmlns="xri://$xrd*($v*2.0)">'
          + '<Type>http://specs.openid.net/auth/2.0/return_to</Type>'
          + '<URI>' + config.server.publicUrl + '/verify</URI>'
          + '</Service></XRD></xrds:XRDS>'
          ).type('application/xrds+xml')
        return
      }
      rp.verifyAssertion(
        url.format(req.url),
        function (err, result) {
          log.debug({ op: 'verify', err: err, result: result })
          if (result.authenticated) {
            Pool.request(
              {
                method: 'POST',
                url: config.peers.auth + '/v1/account/sso?keys=true',
                headers: {
                  'Content-Type': 'application/json'
                }
              },
              JSON.stringify({
                ssoId: result.claimedIdentifier,
                provider: 'yahoo'
              }),
              function (err, res, body) {
                var data = JSON.parse(body)
                reply.redirect(config.peers.content +
                  '/openid?uid=' + data.uid +
                  '&session=' + data.sessionToken +
                  '&key=' + data.keyFetchToken +
                  '&authAt=' + data.authAt +
                  '&service=sync&context=iframe')
              }
            )
          }
          else {
            reply(boom.unauthorized(err && err.message))
          }
        }
      )
    }
  },
  {
    method: 'GET',
    path: '/test',
    config: {},
    handler: function (req, reply) {
      reply(
        '<!DOCTYPE html><html><body>'
        + '<form method="get" action="authenticate">'
        + '<p>Enter an OpenID identifier url</p>'
        + '<input name="identifier" value="https://me.yahoo.com" />'
        + '<input type="submit" value="Login" />'
        + '</form></body></html>'
      ).type('text/html')
    }
  }
])

/*/
    Start your engines
/*/

server.start()

/*/
    ^C graceful shutdown
/*/

process.on(
  'SIGINT',
  function () {
    server.stop(log.info.bind(log, 'shutdown'))
  }
)
