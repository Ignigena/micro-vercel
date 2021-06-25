const path = require('path')
/* eslint-disable-next-line */
const { parse } = require('url')
/* nodejs/node#12682 */

const { json, send, text } = require('micro')
const { parse: parseCookies } = require('cookie')
const { parse: parseContentType } = require('content-type')
const { parse: parseQS } = require('qs')

const { detectBuilders, glob } = require('@vercel/build-utils')
const { getTransformedRoutes } = require('@vercel/routing-utils')
const UrlPattern = require('url-pattern')

function loadHandlerForRoute (dirname, route) {
  route.src = new UrlPattern(new RegExp(route.src))
  if (route.dest) {
    const { query, pathname } = parse(path.join(dirname, route.dest), true)
    try {
      route.dest = require(pathname)
    } catch (err) {
      delete route.dest
      route.status = 500
    }
    route.query = Object.keys(query)
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

exports.parseBody = async (req) => {
  if (!req || !req.headers['content-type']) return undefined

  switch (parseContentType(req.headers['content-type']).type) {
    case 'application/json':
      try {
        return (await json(req))
      } catch (err) {
        return undefined
      }

    case 'application/x-www-form-urlencoded':
      return parseQS(await text(req))

    default:
      return text(req)
  }
}

/**
 * Send a JSON response with correct headers. When run locally the JSON will
 * be sent with extra spacing to be more human-readable.
 */
exports.json = (req, res) => jsonBody => {
  const body = JSON.stringify(jsonBody, null, 2)

  if (!res.getHeader('content-type')) {
    res.setHeader('content-type', 'application/json; charset=utf-8')
  }

  return res.send(body)
}

exports.send = (req, res) => body => {
  send(res, res.statusCode, body)
}

exports.router = ({ dirname }) => {
  const setup = exports.setup({ dirname })

  return async (req, res) => {
    const config = await setup
    let { query, pathname } = parse(req.url, true)

    const match = config.routes.find(route => {
      // @TODO: Implement route pass through for headers, etc.
      if (route.continue) return false
      // @TODO: Implement filesystem pass through
      if (route.handle === 'filesystem') return false

      return route.src.match(pathname)
    })

    if (!match || (match.status && !match.dest)) {
      return send(res, (match && match.status) || 404)
    }

    const params = match.src.match(pathname)
    if (params.length && match.query.length) {
      query = match.query.reduce((result, key, index) => {
        result[key] = params[index]
        return result
      }, query)
    }

    match.dest(Object.assign(req, { params, query }), res)
  }
}

/**
 * The Node runtime used on Vercel has a few convenience methods added. This
 * higher order function modifies the request and response objects to more
 * closely resemble production. @see https://www.npmjs.com/package/@vercel/node
 */
exports.withHelpers = next => async (req, res) => {
  req.body = await exports.parseBody(req)
  req.cookies = parseCookies(req.headers.cookie || '')
  req.query = Object.assign(req.query || {}, parse(req.url, true).query)

  res.status = statusCode => {
    res.statusCode = statusCode
    return res
  }
  res.send = exports.send(req, res)
  res.json = exports.json(req, res)

  try {
    await next(req, res)
  } catch (err) {
    send(res, err.statusCode || 500, err.message)
  }
}
