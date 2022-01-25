const path = require('path')

const serve = require('serve-handler')
const { withMiddleware } = require('@nautilus/micro')

const { detectBuilders, glob } = require('@vercel/build-utils')
const { getTransformedRoutes } = require('@vercel/routing-utils')
const UrlPattern = require('url-pattern')

exports.setup = async ({ dirname }) => {
  const pkg = require(path.join(dirname, 'package.json'))
  const config = { routes: [] }

  try {
    const { routes } = getTransformedRoutes({ nowConfig: require(path.join(dirname, 'vercel.json')) })
    config.routes = routes
  } catch (err) {}

  const fileList = await glob('**', dirname)
  const files = Object.keys(fileList)

  const { defaultRoutes } = await detectBuilders(files, pkg)
  config.routes.push(...defaultRoutes || [])

  config.routes.map(route => {
    route.src = new UrlPattern(new RegExp(route.src))
    return route
  })

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
      res.statusCode = match.status || 404
      return res.end()
    }

    const [base, query] = match.dest.split('?')

    const params = match.src.match(pathname)
    Array.from(new URLSearchParams(query).keys()).forEach((key, index) => searchParams.set(key, params[index]))

    try {
      if (match.dest.startsWith('/public')) {
        return serve(req, res, { directoryListing: false, public: dirname + '/public' })
      }

      require(path.join(dirname, base))(Object.assign(req, { params, query: Object.fromEntries(searchParams) }), res)
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.end()
    }
  }
}

/**
 * The Node runtime used on Vercel has a few convenience methods added. This
 * higher order function modifies the request and response objects to more
 * closely resemble production. @see https://www.npmjs.com/package/@vercel/node
 */
exports.withHelpers = withMiddleware(['response', 'errors', 'parse'])
