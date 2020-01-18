const path = require('path')
const { parse } = require('url')

const { send } = require('micro')

const { detectBuilders, detectRoutes, glob } = require('@now/build-utils')
const UrlPattern = require('url-pattern')

exports.setup = async ({ dirname }) => {
  const pkg = require(path.join(dirname, 'package.json'))
  let config

  try {
    config = require(path.join(dirname, 'now.json'))
  } catch (err) {
    config = {}
  }

  config.routes = config.routes || []

  const fileList = await glob('**', dirname)
  const files = Object.keys(fileList)

  const { builders } = await detectBuilders(files, pkg)
  if (builders) {
    const { defaultRoutes } = await detectRoutes(files, builders)
    config.routes.push(...defaultRoutes)
  }

  config.routes.map(route => {
    route.src = new UrlPattern(new RegExp(route.src))
    route.dest = route.dest && require(path.join(dirname, route.dest))
    return route
  })

  return config
}

exports.router = ({ dirname }) => {
  const setup = exports.setup({ dirname })

  return async (req, res) => {
    const config = await setup
    const { query, pathname } = parse(req.url, true)

    const match = config.routes.find(({ src }) => src.match(pathname))
    if (!match) return send(res, 404)

    if (match.status && !match.dest) return send(res, match.status)

    const params = match.src.match(pathname)
    match.dest(Object.assign(req, { params, query }), res)
  }
}
