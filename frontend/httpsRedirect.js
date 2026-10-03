// Sur un serveur HTTPS, une requête en http:// reçoit une réponse vide
// (« … n'a envoyé aucune donnée » sur Chrome). Ce plugin lit le premier octet de chaque
// connexion : une poignée de main TLS (0x16) suit son cours normal, une requête HTTP en clair
// est redirigée vers la même adresse en https://.

const TLS_HANDSHAKE = 0x16

function redirectResponse(firstChunk, port) {
  const head = firstChunk.toString('latin1')
  const path = head.match(/^[A-Z]+ (\S+) HTTP/)?.[1] ?? '/'
  const hostHeader = head.match(/\r\nhost:\s*([^\r\n]+)/i)?.[1]?.trim() ?? `localhost:${port}`
  const location = `https://${hostHeader}${path.startsWith('/') ? path : '/'}`
  return (
    'HTTP/1.1 301 Moved Permanently\r\n' +
    `Location: ${location}\r\n` +
    'Content-Length: 0\r\n' +
    'Connection: close\r\n\r\n'
  )
}

export default function httpsRedirect() {
  return {
    name: 'http-to-https-redirect',
    configureServer(server) {
      const httpServer = server.httpServer
      if (!httpServer || typeof httpServer.addContext !== 'function') return // pas un serveur TLS

      const tlsListeners = httpServer.listeners('connection')
      httpServer.removeAllListeners('connection')
      httpServer.on('connection', (socket) => {
        socket.once('data', (chunk) => {
          if (chunk[0] === TLS_HANDSHAKE) {
            socket.pause()
            socket.unshift(chunk)
            for (const listener of tlsListeners) listener.call(httpServer, socket)
            process.nextTick(() => socket.resume())
          } else {
            socket.end(redirectResponse(chunk, server.config.server.port))
          }
        })
        socket.on('error', () => socket.destroy())
      })
    },
  }
}
