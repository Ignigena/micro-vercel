const { watch } = require('chokidar')
const chalk = require('chalk')
const http = require('http')

const getPort = require('get-port')
const path = require('path')

const { router, withHelpers } = require('../')

module.exports = async (flags) => {
  let dirname = process.cwd()
  if (flags._[0]) {
    dirname = flags._[0].match(/^\w+:/) || flags._[0].match(/^\//) ? flags._[0] : path.resolve(dirname, flags._[0])
  }

  const watchConfig = {
    usePolling: flags.poll,
    ignoreInitial: true,
    ignored: [
      /\.git|node_modules|\.nyc_output|\.sass-cache|coverage|\.cache/,
      /\.swp$/
    ]
  }

  // Ignore globs
  if (flags.ignore) {
    watchConfig.ignored = watchConfig.ignored.concat(new RegExp(flags.ignore))
  }

  // Start watching the project files
  const watcher = watch(dirname, watchConfig)

  // Ensure that the server gets restarted if a file changes
  watcher.on('all', (event, filePath) => {
    console.log(
      `\n${chalk.blue('File changed:')} ${path.relative(process.cwd(), filePath)} - Clearing module cache...`
    )
    delete require.cache[filePath]
  })

  const handler = withHelpers(router({ dirname }))
  return http.createServer(handler).listen(await getPort(flags), function () {
    const { address, port } = this.address()
    const localHost = `http://${address === '::' ? 'localhost' : address}:${port}`
    console.log(`${chalk.green('🚀 Server ready at:')} ${localHost}`)
  })
}
