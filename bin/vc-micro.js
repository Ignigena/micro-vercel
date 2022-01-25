#!/usr/bin/env node
const mri = require('mri')
const serve = require('./serve')

process.env.NODE_ENV = process.env.NODE_ENV || 'development'

const flags = mri(process.argv.slice(2), {
  default: {
    host: '::'
  },
  alias: {
    p: 'port',
    H: 'host'
  }
})

flags.port = parseInt(flags.port) || 3000

serve(flags)
