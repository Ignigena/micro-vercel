/**
 * Test case borrowed from:
 * https://zeit.co/docs/runtimes#official-runtimes/node-js/node-js-request-and-response-objects/node-js-helpers
 */
module.exports = (req, res) => {
  let who = 'anonymous'

  if (req.body && req.body.who) {
    who = req.body.who
  } else if (req.query.who) {
    who = req.query.who
  } else if (req.cookies.who) {
    who = req.cookies.who
  }

  res.status(200).send(`Hello ${who}!`)
}
