#!/usr/bin/env node

import { relative } from 'path'
import { clearCache } from './cache.js'
import { resolveChromeUri } from './index.js'

const root = process.cwd()
const uri = process.argv[2]

if (uri === '-c' || uri === '--clear') {
  const rm = await clearCache()
  console.log(`Cache cleared, removed entries: ${rm}`)
  process.exit()
}

const res = await resolveChromeUri(root, uri)
if (res instanceof Set)
  for (const path of res) console.log(relative(root, path))
else console.dir(res, { depth: null })
