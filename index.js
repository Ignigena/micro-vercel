const path = require('path')

const serve = require('serve-handler')
const { withMiddleware } = require('@nautilus/micro')

const { detectBuilders, glob } = require('@vercel/build-utils')
const { getTransformedRoutes } = require('@vercel/routing-utils')
const UrlPattern = require('url-pattern')

function loadHandlerForRoute (dirname, route) {
  route.src = new UrlPattern(new RegExp(route.src))
  if (route.dest) {
    const [base, query] = route.dest.split('?')
    try {
      route.dest = require(path.join(dirname, base))
    } catch (err) {
      delete route.dest
      route.status = 500
    }
    route.query = Array.from(new URLSearchParams(query).keys())
  }
  return route
}

exports.setup = async ({ dirname }) => {
  const pkg = require(path.join(dirname, 'package.json'))
  let config

  try {
    config = require(path.join(dirname, 'vercel.json'))
  } catch (err) {
    config = {}
  }

  const { error, routes } = getTransformedRoutes({ nowConfig: config })
  if (error) console.error(error)

  config.routes = routes || []

  const fileList = await glob('**', dirname)
  const files = Object.keys(fileList)

  const { defaultRoutes } = await detectBuilders(files, pkg)
  config.routes.push(...defaultRoutes || [])

  config.routes.map(route => loadHandlerForRoute(dirname, route))

  return config
}

exports.router = ({ dirname }) => {
  const setup = exports.setup({ dirname })

  return async (req, res) => {
    const config = await setup
    const { searchParams, pathname } = new URL(req.url, `http://${req.headers.host}`)

    const match = config.routes.find(route => {
      // @TODO: Implement route pass through for headers, etc.
      if (route.continue) return false
      // @TODO: Implement filesystem pass through
      if (route.handle === 'filesystem') return false

      return route.src.match(pathname)
    })

    if (!match || (match.status && !match.dest)) {
      return serve(req, res, { directoryListing: false, public: dirname + '/public' })
    }

    const params = match.src.match(pathname)
    match.query.forEach((key, index) => searchParams.set(key, params[index]))

    match.dest(Object.assign(req, { params, query: Object.fromEntries(searchParams) }), res)
  }
}

/**
 * The Node runtime used on Vercel has a few convenience methods added. This
 * higher order function modifies the request and response objects to more
 * closely resemble production. @see https://www.npmjs.com/package/@vercel/node
 */
exports.withHelpers = withMiddleware(['response', 'errors', 'parse'])
