const path = require('path')
/* eslint-disable-next-line */
const { parse } = require('url')
/* nodejs/node#12682 */

const { send } = require('micro')
const getRawBody = require('raw-body')
const { parse: parseCookies } = require('cookie')
const { parse: parseContentType } = require('content-type')
const { parse: parseQS } = require('qs')

const { detectBuilders, detectRoutes, glob } = require('@now/build-utils')
const UrlPattern = require('url-pattern')

function loadHandlerForRoute (dirname, route) {
  route.src = new UrlPattern(new RegExp(route.src))
  if (route.dest) {
    const { query, pathname } = parse(path.join(dirname, route.dest), true)
    route.dest = require(pathname)
    route.query = Object.keys(query)
  }
  return route
}

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

  config.routes.map(route => loadHandlerForRoute(dirname, route))

  return config
}

exports.parseBody = (body, type) => {
  if (!body || !type) return undefined

  switch (parseContentType(type).type) {
    case 'application/json':
      try {
        return JSON.parse(body.toString())
      } catch (error) {
        return undefined
      }

    case 'application/x-www-form-urlencoded':
      return parseQS(body.toString())

    default:
      return body.toString()
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

    const match = config.routes.find(({ src }) => src.match(pathname))
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
 * The Node runtime used on ZEIT Now has a few convenience methods added. This
 * higher order function modifies the request and response objects to more
 * closely resemble production. @see https://www.npmjs.com/package/@now/node
 */
exports.withHelpers = next => async (req, res) => {
  const body = await getRawBody(req)
  req.body = exports.parseBody(body, req.headers['content-type'])
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
