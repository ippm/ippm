#!/usr/bin/env node
require('source-map-support/register');
require(process.env.NODE_ENV === 'development' ? './ippm.js' : './ippm.min.js')._entrypoint();
