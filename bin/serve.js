const getPort = require('get-port')
const serve = require('micro/lib')

const listening = require('micro-dev/lib/listening')
const log = require('micro-dev/lib/log')

module.exports = async (handler, flags, restarting) => {
  if (restarting) process.emit('SIGUSR2')

  const module = flags.silent ? handler : log(handler, flags.limit)
  const server = serve(module)

  let port = flags.port

  // Check if the specified port is already in use
  const open = await getPort(flags.port)
  const old = port

  let inUse = open !== port

  // Only overwrite the port when restarting
  if (inUse && !restarting) {
    port = open
    inUse = { old, open }
  }

  const sockets = []

  server.listen(port, flags.host, err => {
    if (err) {
      console.error('micro:', err.stack)
      process.exit(1)
    }

    flags.restarted = restarting
    flags._[0] = flags._[0] || process.cwd()

    return listening(server, inUse, flags, sockets)
  })

  server.on('connection', socket => {
    const index = sockets.push(socket)
    socket.once('close', () => sockets.splice(index, 1))
  })
}
