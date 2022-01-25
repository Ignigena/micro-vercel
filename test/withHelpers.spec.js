const assert = require('assert')
const { stub } = require('sinon')
const request = require('supertest')

const { withHelpers } = require('../')
const whoami = require('./zero-config/api/whoami')

describe('withHelpers', () => {
  it('catches application errors', async () => {
    const logger = stub(console, 'error')
    const handler = withHelpers((req, res) => {
      throw new Error('whoops')
    })
    await request(handler).get('/').expect(500)
    logger.restore()
  })

  it('req: `query`, `cookies` and `body`', async () => {
    const handler = withHelpers(whoami)

    assert((await Promise.all([
      request(handler).post('/').send({ who: 'Ignigena' }),
      request(handler).post('/').send('who=Ignigena'),
      request(handler).get('/?who=Ignigena'),
      request(handler).get('/').set('Cookie', ['who=Ignigena'])
    ])).every(({ text }) => text === 'Hello Ignigena!'))

    assert((await Promise.all([
      request(handler).get('/'),
      request(handler).get('/').send('{malformed:[{ json }]}').set('Content-Type', 'application/json'),
      request(handler).get('/').send('Ignigena').set('Content-Type', 'text/plain')
    ])).every(({ text }) => text === 'Hello anonymous!'))
  })

  describe('res: `send` helper', () => {
    it('works with minimal setup', () => {
      const handler = withHelpers((req, res) => res.send('ok'))
      return request(handler).get('/').expect(200)
    })

    it('preserves application status code', () => {
      const handler = withHelpers((req, res) => res.status(404).send('not found'))
      return request(handler).get('/').expect(404)
    })
  })

  describe('res: `json` helper', () => {
    it('appends the correct headers', () => {
      const handler = withHelpers((req, res) => res.json({ hello: 'world' }))
      return request(handler).get('/')
        .expect(200)
        .expect('content-type', 'application/json; charset=utf-8')
    })

    it('preserves application headers', async () => {
      const handler = withHelpers((req, res) => {
        res.setHeader('content-type', 'application/ld+json')
        res.json({ hello: 'world' })
      })
      return request(handler).get('/')
        .expect(200)
        .expect('content-type', 'application/ld+json')
    })
  })
})
