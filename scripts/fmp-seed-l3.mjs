#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  checkTextFromMirrorId,
  commentForFile,
  hasL3Lite,
  inferExports,
  inferMirrorIdFromPath,
  listP0CodeFiles,
  loadConfig,
  parseArgs,
  readText,
  roleFromPath,
  rootFromArgs,
  writeText,
} from './lib/fmp-utils.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const write = Boolean(args.write)
const limit = Number(args.limit || 50)
const cfg = loadConfig(root)

const files = listP0CodeFiles(root, cfg).slice(0, limit)
const planned = []

for (const f of files) {
  const full = path.join(root, f)
  const content = readText(full)
  if (hasL3Lite(content)) continue

  const id = inferMirrorIdFromPath(f)
  const role = roleFromPath(f)
  const mirror = `.fmp/mirror-matrix.yaml#${id}`
  const exportsValue = inferExports(f, root)
  const check = checkTextFromMirrorId(id)
  const header = commentForFile(f, role, mirror, exportsValue, check)

  planned.push(f)

  if (write) {
    // Preserve shebang for scripts.
    if (content.startsWith('#!')) {
      const [first, ...rest] = content.split(/\r?\n/)
      writeText(full, `${first}\n${header}${rest.join('\n')}`)
    }
    else {
      writeText(full, `${header}${content}`)
    }
  }
}

console.log('FMP L3-Lite seed')
console.log('')
console.log(write ? 'Mode: write' : 'Mode: dry-run')
console.log(`Candidates: ${planned.length}`)
for (const f of planned) console.log(`- ${f}`)

if (!write) {
  console.log('')
  console.log('Re-run with --write to modify files.')
}
