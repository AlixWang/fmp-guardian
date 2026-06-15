#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  globToRegex,
  loadConfig,
  parseArgs,
  readText,
  rootFromArgs,
} from './lib/fmp-utils.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const decision = args._.join(' ') || args.decision || 'Unspecified design/code change'
const cfg = loadConfig(root)
const matrixPath = path.join(root, cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml')
const matrix = readText(matrixPath)

const changed = []
if (args.changed) {
  changed.push(...String(args.changed).split(',').map(s => s.trim()).filter(Boolean))
}

const mirrorBlocks = parseSimpleMirrors(matrix)
const matched = mirrorBlocks.filter(m => {
  if (!changed.length) return keywordMatch(decision, m)
  return changed.some(file => (m.code || []).some(pattern => globToRegex(pattern).test(file)))
})

console.log('# FMP Sync Plan')
console.log('')
console.log('## Decision')
console.log(decision)
console.log('')
console.log('## Changed files supplied')
if (changed.length) {
  for (const f of changed) console.log(`- \`${f}\``)
}
else {
  console.log('- None supplied. Matched by decision keywords only.')
}
console.log('')
console.log('## Affected Mirrors')
const targets = matched.length ? matched : mirrorBlocks.slice(0, 5)
for (const m of targets) {
  console.log(`### ${m.id}`)
  console.log('')
  console.log('Code:')
  for (const c of m.code || []) console.log(`- \`${c}\``)
  console.log('')
  console.log('Docs:')
  if (m.docs?.length) for (const d of m.docs) console.log(`- \`${d}\``)
  else console.log('- No semantic docs mapped yet. Create or assign one if behavior changes.')
  console.log('')
  console.log('Sync when:')
  for (const s of m.sync_when || []) console.log(`- ${s}`)
  console.log('')
}
console.log('## Required FMP Actions')
console.log('')
console.log('- Review matched semantic mirrors before implementation.')
console.log('- Update docs if behavior, public contracts, state transitions, permissions, persistence, prompts, or eval expectations change.')
console.log('- Run relevant project checks/evals from `.fmp/config.json`.')
console.log('- Report remaining FMP debt.')

function keywordMatch(text, mirror) {
  const t = text.toLowerCase()
  const hay = [mirror.id, ...(mirror.code || []), ...(mirror.docs || []), ...(mirror.sync_when || [])].join(' ').toLowerCase()
  return t.split(/\W+/).filter(w => w.length > 3).some(w => hay.includes(w))
}

function parseSimpleMirrors(yaml) {
  const mirrors = []
  const lines = yaml.split(/\r?\n/)
  let cur = null
  let section = null
  for (const line of lines) {
    const id = line.match(/^\s*-\s+id:\s+(.+)\s*$/)
    if (id) {
      if (cur) mirrors.push(cur)
      cur = { id: id[1].replace(/^"|"$/g, ''), code: [], docs: [], evals: [], sync_when: [] }
      section = null
      continue
    }
    if (!cur) continue
    const sec = line.match(/^\s+(code|docs|evals|sync_when):\s*$/)
    if (sec) {
      section = sec[1]
      continue
    }
    const item = line.match(/^\s+-\s+(.+)\s*$/)
    if (item && section && cur[section]) {
      cur[section].push(item[1].replace(/^"|"$/g, ''))
    }
  }
  if (cur) mirrors.push(cur)
  return mirrors
}
