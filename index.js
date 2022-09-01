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
    const { routes } = getTransformedRoutes(require(path.join(dirname, 'vercel.json')))
    config.routes = routes || []
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

    function findMatchingRoute (forPath) {
      const match = config.routes.find(route => {
        // @TODO: Implement route pass through for headers, etc.
        if (route.continue) return false
        // @TODO: Implement filesystem pass through
        if (route.handle === 'filesystem') return false

        return route.src.match(forPath)
      })

      if (!match?.check) {
        return {
          match,
          params: match?.src?.match(forPath),
          forPath
        }
      }

      // Handle rewrites
      const rewrite = forPath.replace(match.src.regex, match.dest)
      return findMatchingRoute(rewrite, forPath)
    }

    const { match, params, forPath } = findMatchingRoute(pathname)
    const destQuery = forPath.includes('?') ? new URLSearchParams(forPath.split('?').pop()) : null

    if (!match || (match.status && !match.dest)) {
      res.statusCode = match?.status || 404
      return res.end()
    }

    const [base, matchQuery] = match.dest.split('?')
    Array.from(
      destQuery?.keys() ?? new URLSearchParams(matchQuery).keys()
    ).forEach((key, index) => searchParams.set(key, destQuery?.get(key) ?? params[index]))

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
