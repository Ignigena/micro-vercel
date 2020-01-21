#!/usr/bin/env node
const mri = require('mri')
const serve = require('./serve')

process.env.NODE_ENV = process.env.NODE_ENV || 'development'

const flags = mri(process.argv.slice(2), {
  default: {
    host: '::',
    limit: '1mb'
  },
  alias: {
    p: 'port',
    H: 'host',
    l: 'limit',
    s: 'silent'
  }
})

flags.port = parseInt(flags.port) || 3000

serve(flags)
