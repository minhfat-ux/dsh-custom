/**
 * Minimal reverse proxy for testing where the Host header matters.
 *
 * `--mode preserve` forwards the incoming Host header, which is what Caddy's
 * `reverse_proxy` does by default. `--mode rewrite` replaces it with the
 * upstream authority, which is what nginx's default `proxy_set_header Host
 * $proxy_host` does. Nothing here terminates TLS; it exists to exercise the
 * server's Host/Origin fence, not to be deployed.
 */

import { createServer, request as httpRequest } from 'node:http'

const argv = process.argv.slice(2)
const value = (flag) => argv[argv.indexOf(flag) + 1]
const port = Number(value('--port'))
const target = new URL(value('--target'))
const mode = value('--mode')
if (!Number.isInteger(port) || (mode !== 'preserve' && mode !== 'rewrite')) {
  console.error('usage: node host-proxy.mjs --port <n> --target <url> --mode preserve|rewrite')
  process.exit(2)
}

const server = createServer((incoming, outgoing) => {
  const headers = { ...incoming.headers }
  // Hop-by-hop headers belong to the client connection, not the upstream one.
  delete headers.connection
  delete headers['keep-alive']
  delete headers['proxy-connection']
  delete headers.upgrade
  if (mode === 'rewrite') headers.host = target.host

  const upstream = httpRequest({
    hostname: target.hostname,
    port: target.port,
    path: incoming.url,
    method: incoming.method,
    headers,
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers)
    // pipe keeps server-sent events streaming instead of buffering them.
    response.pipe(outgoing)
  })
  upstream.on('error', (error) => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'text/plain' })
    outgoing.end(`proxy error: ${error.message}`)
  })
  incoming.pipe(upstream)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`proxy mode=${mode} listening on 127.0.0.1:${port} -> ${target.origin}`)
})
