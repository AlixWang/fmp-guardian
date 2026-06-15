#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  hasL3Lite,
  listP0CodeFiles,
  loadConfig,
  parseArgs,
  readText,
  rootFromArgs,
  walk,
} from './lib/fmp-utils.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const cfg = loadConfig(root)

const allFiles = walk(root)
const agentDocs = allFiles.filter(f => path.basename(f) === 'AGENTS.md')
const p0Files = listP0CodeFiles(root, cfg)
const anchored = p0Files.filter(f => hasL3Lite(readText(path.join(root, f))))

const matrixPath = path.join(root, cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml')
const matrix = readText(matrixPath)
const missingDocMarkers = (matrix.match(/docs:\s*\[\]/g) || []).length + (matrix.match(/docs:\n\s*\[\]/g) || []).length

console.log('# FMP Doctor')
console.log('')
console.log('## Project')
console.log(`- Name: ${cfg.project?.name || 'unknown'}`)
console.log(`- Type: ${cfg.project?.type || 'unknown'}`)
console.log(`- Languages: ${(cfg.project?.languages || []).join(', ') || 'unknown'}`)
console.log('')
console.log('## Coverage')
console.log(`- Root AGENTS.md: ${fs.existsSync(path.join(root, 'AGENTS.md')) ? 'OK' : 'MISSING'}`)
console.log(`- Nested AGENTS.md: ${Math.max(0, agentDocs.length - 1)}`)
console.log(`- Mirror matrix: ${fs.existsSync(matrixPath) ? 'OK' : 'MISSING'}`)
console.log(`- P0 patterns: ${(cfg.paths?.p0 || []).length}`)
console.log(`- P0 code files: ${p0Files.length}`)
console.log(`- L3-Lite anchors: ${anchored.length}/${p0Files.length}`)
console.log('')
console.log('## Commands')
const commands = cfg.checks?.commands || {}
if (Object.keys(commands).length) {
  for (const [name, cmd] of Object.entries(commands)) console.log(`- ${name}: \`${cmd}\``)
}
else {
  console.log('- No commands detected.')
}
console.log('')
console.log('## Debt')
const debt = []
if (!fs.existsSync(path.join(root, 'AGENTS.md'))) debt.push('Create root AGENTS.md.')
if (!fs.existsSync(matrixPath)) debt.push('Create .fmp/mirror-matrix.yaml.')
if (anchored.length < p0Files.length) debt.push(`Add L3-Lite to selected P0 files or relax P0 patterns. Missing: ${p0Files.length - anchored.length}.`)
if (missingDocMarkers) debt.push(`Some mirror entries have no semantic docs detected. Review mirror matrix.`)
if (agentDocs.length > 12) debt.push(`Many AGENTS.md files detected (${agentDocs.length}). Consider pruning nested docs.`)

if (debt.length) {
  for (const d of debt) console.log(`- ${d}`)
}
else {
  console.log('- No obvious FMP debt detected.')
}
