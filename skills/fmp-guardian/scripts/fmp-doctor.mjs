#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  hasL3Lite,
  l3RequiresAllP0,
  l3RequiresSelectedP0,
  listP0CodeFiles,
  listSelectedP0Files,
  loadConfig,
  loadMirrorMatrix,
  parseArgs,
  readText,
  rootFromArgs,
  walk,
} from './lib/fmp-utils.mjs'
import { architectureSnapshotText, buildArchitectureSnapshot, staleArchitectureDocs } from './lib/fmp-architecture.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const cfg = loadConfig(root)

const allFiles = walk(root, cfg.scan || {})
const agentDocs = allFiles.filter(f => path.basename(f) === 'AGENTS.md')
const p0Files = listP0CodeFiles(root, cfg)
const selectedP0Files = listSelectedP0Files(root, cfg)
const hasPersistedSelectedP0 = Array.isArray(cfg.l3Lite?.selectedFiles) && cfg.l3Lite.selectedFiles.length > 0
const anchored = p0Files.filter(f => hasL3Lite(readText(path.join(root, f))))
const selectedAnchored = selectedP0Files.filter(f => hasL3Lite(readText(path.join(root, f))))
const requireAllP0L3 = l3RequiresAllP0(cfg)
const requireSelectedP0L3 = l3RequiresSelectedP0(cfg)

const matrixPath = path.join(root, cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml')
const matrix = readText(matrixPath)
const missingDocMarkers = (matrix.match(/docs:\s*\[\]/g) || []).length + (matrix.match(/docs:\n\s*\[\]/g) || []).length
const mirrors = loadMirrorMatrix(root, cfg)
const snapshotPath = path.join(root, cfg.architecture?.snapshot || '.fmp/architecture-snapshot.json')
const snapshotExists = fs.existsSync(snapshotPath)
const snapshotCurrent = snapshotExists
  && readText(snapshotPath) === architectureSnapshotText(buildArchitectureSnapshot(root, cfg))
const staleManagedDocs = staleArchitectureDocs(root, cfg, buildArchitectureSnapshot(root, cfg))
const missingMirrorDocs = mirrors.flatMap(mirror => (mirror.docs || [])
  .map(doc => ({ mirror: mirror.id, doc: doc.split('#')[0] })))
  .filter(item => !fs.existsSync(path.join(root, item.doc)))
const pendingSemanticDocs = allFiles.filter(file => /\.mdx?$/.test(file))
  .filter(file => readText(path.join(root, file)).includes('FMP:SEMANTIC_REVIEW_PENDING'))

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
console.log(`- Architecture snapshot: ${snapshotCurrent ? 'CURRENT' : snapshotExists ? 'STALE' : 'MISSING'}`)
console.log(`- Architecture overview: ${fs.existsSync(path.join(root, cfg.architecture?.overview || 'docs/architecture/overview.md')) ? 'OK' : 'MISSING'}`)
console.log(`- Pending semantic reviews: ${pendingSemanticDocs.length}`)
console.log(`- Stale managed architecture docs: ${staleManagedDocs.length}`)
console.log(`- P0 patterns: ${(cfg.paths?.p0 || []).length}`)
console.log(`- P0 code files: ${p0Files.length}`)
console.log(`- Selected P0 files: ${selectedP0Files.length}`)
console.log(`- Selected L3-Lite anchors: ${selectedAnchored.length}/${selectedP0Files.length}`)
console.log(`- All P0 L3-Lite anchors: ${anchored.length}/${p0Files.length}`)
console.log(`- L3-Lite policy: ${(cfg.l3Lite?.requiredFor || ['p0']).join(', ')}`)
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
if (requireAllP0L3 && anchored.length < p0Files.length) debt.push(`Add L3-Lite to P0 files or relax P0 patterns. Missing: ${p0Files.length - anchored.length}.`)
if (requireSelectedP0L3 && !hasPersistedSelectedP0) debt.push('Persist reviewed selected P0 files in l3Lite.selectedFiles.')
if (requireSelectedP0L3 && selectedP0Files.length === 0) debt.push('Populate l3Lite.selectedFiles or change l3Lite.requiredFor.')
if (requireSelectedP0L3 && selectedAnchored.length < selectedP0Files.length) debt.push(`Add L3-Lite to selected P0 files. Missing: ${selectedP0Files.length - selectedAnchored.length}.`)
if (missingDocMarkers) debt.push(`Some mirror entries have no semantic docs detected. Review mirror matrix.`)
if (!snapshotExists) debt.push('Generate the architecture snapshot with fmp-scan --write.')
else if (!snapshotCurrent) debt.push('Architecture snapshot is stale; refresh it and review affected docs.')
for (const item of missingMirrorDocs) debt.push(`Mirror ${item.mirror} references missing doc ${item.doc}.`)
if (pendingSemanticDocs.length) debt.push(`Complete agent semantic review in ${pendingSemanticDocs.length} architecture document(s).`)
if (staleManagedDocs.length) debt.push(`Refresh deterministic facts in ${staleManagedDocs.length} architecture document(s).`)
if (agentDocs.length > 12) debt.push(`Many AGENTS.md files detected (${agentDocs.length}). Consider pruning nested docs.`)

if (debt.length) {
  for (const d of debt) console.log(`- ${d}`)
}
else {
  console.log('- No obvious FMP debt detected.')
}
