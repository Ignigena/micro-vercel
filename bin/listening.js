const path = require('path')

const chalk = require('chalk')
const { watch } = require('chokidar')
const debounce = require('debounce')
const pkgUp = require('pkg-up')

const listening = require('micro-dev/lib/listening')

function restartServer (flags, watcher) {
  const toDelete = Object.entries(watcher.getWatched()).reduce((result, [mainPath, subPaths]) => {
    result.push(...subPaths.map(subPath => path.join(mainPath, subPath)))
    return result
  }, [])

  // Remove file that changed from the `require` cache
  for (const item of toDelete) {
    try {
      const location = require.resolve(item)
      delete require.cache[location]
    } catch (err) {
      continue
    }
  }

  // Restart the server
  require('./serve')(flags, true)
}

async function hmr (server, flags, sockets) {
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

  // Find out which directory to watch
  const closestPkg = await pkgUp(path.dirname(flags._[0]))
  const toWatch = [closestPkg ? path.dirname(closestPkg) : process.cwd()]

  // Start watching the project files
  const watcher = watch(toWatch, watchConfig)

  // Ensure that the server gets restarted if a file changes
  watcher.once('all', debounce((event, filePath) => {
    const location = path.relative(process.cwd(), filePath)

    console.log(
      `\n${chalk.blue('File changed:')} ${location} - Restarting server...`
    )

    // Destroy all sockets before closing the server
    for (const socket of sockets) {
      socket.destroy()
    }

    // Restart server
    server.close(restartServer.bind(this, flags, watcher))
  }, 10))
}

module.exports = async (server, inUse, flags, sockets) => {
  const details = server.address()
  flags.port = details.port

  if (!flags.cold) {
    hmr(server, flags, sockets)
  }

  listening(server, inUse, { cold: true, ...flags })
}
