const micro = require('micro')
const request = require('supertest')

const { withHelpers } = require('../')

describe('withHelpers', () => {
  it('catches application errors', () => {
    const handler = micro(withHelpers((req, res) => {
      throw new Error('whoops')
    }))
    return request(handler).get('/').expect(500)
  })

  describe('res: `send` helper', () => {
    it('works with minimal setup', () => {
      const handler = micro(withHelpers((req, res) => res.send('ok')))
      return request(handler).get('/').expect(200)
    })

    it('preserves application status code', () => {
      const handler = micro(withHelpers((req, res) => res.status(404).send('not found')))
      return request(handler).get('/').expect(404)
    })
  })

  describe('res: `json` helper', () => {
    it('appends the correct headers', () => {
      const handler = micro(withHelpers((req, res) => res.json({ hello: 'world' })))
      return request(handler).get('/')
        .expect(200)
        .expect('content-type', 'application/json; charset=utf-8')
    })

    it('preserves application headers', async () => {
      const handler = micro(withHelpers((req, res) => {
        res.setHeader('content-type', 'application/ld+json')
        res.json({ hello: 'world' })
      }))
      return request(handler).get('/')
        .expect(200)
        .expect('content-type', 'application/ld+json')
    })
  })
})
