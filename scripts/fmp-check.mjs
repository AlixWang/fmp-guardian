#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  extractL3,
  hasL3Lite,
  listP0CodeFiles,
  loadConfig,
  parseArgs,
  readText,
  rootFromArgs,
} from './lib/fmp-utils.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const strict = Boolean(args.strict) || process.env.CI === 'true'
const cfg = loadConfig(root)

const warnings = []
const failures = []

const agentsPath = path.join(root, cfg.entryDocs?.primary || 'AGENTS.md')
if (!fs.existsSync(agentsPath)) {
  failures.push('Missing root AGENTS.md.')
}
else {
  const bytes = fs.statSync(agentsPath).size
  const max = cfg.agentsDocs?.maxRootBytes ?? 24000
  if (bytes > max) warnings.push(`Root AGENTS.md is ${bytes} bytes, above configured max ${max}.`)
}

const matrixPath = path.join(root, cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml')
if (!fs.existsSync(matrixPath)) {
  failures.push(`Missing mirror matrix: ${cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml'}`)
}

const p0Files = listP0CodeFiles(root, cfg)
let anchored = 0

for (const f of p0Files) {
  const content = readText(path.join(root, f))
  if (hasL3Lite(content)) {
    anchored++
    const l3 = extractL3(content) || ''
    const max = cfg.l3Lite?.maxLines ?? 6
    const lineCount = l3.split(/\r?\n/).filter(Boolean).length
    if (lineCount > max + 3) warnings.push(`L3-Lite may be too long in ${f}.`)
  }
  else {
    const msg = `Missing L3-Lite in P0 file: ${f}`
    if (strict || cfg.l3Lite?.failOnMissing) failures.push(msg)
    else warnings.push(msg)
  }
}

console.log('FMP Check')
console.log('')
console.log(`P0 code files: ${p0Files.length}`)
console.log(`L3-Lite coverage: ${anchored}/${p0Files.length}`)

if (warnings.length) {
  console.log('')
  console.log('Warnings:')
  for (const w of warnings) console.log(`- ${w}`)
}

if (failures.length) {
  console.log('')
  console.log('Failures:')
  for (const f of failures) console.log(`- ${f}`)
  process.exitCode = 1
}
else {
  console.log('')
  console.log(warnings.length ? 'FMP CHECK WARN' : 'FMP CHECK PASS')
}
