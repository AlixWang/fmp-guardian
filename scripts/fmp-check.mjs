#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  globToRegex,
  extractL3,
  hasL3Lite,
  l3RequiresAllP0,
  l3RequiresSelectedP0,
  listP0CodeFiles,
  listSelectedP0Files,
  loadConfig,
  loadMirrorMatrix,
  matchesAny,
  parseArgs,
  readText,
  rootFromArgs,
  walk,
} from './lib/fmp-utils.mjs'
import {
  architectureSnapshotText,
  buildArchitectureSnapshot,
  staleArchitectureDocs,
} from './lib/fmp-architecture.mjs'
import {
  affectedMirrors,
  codeFingerprint,
  parseImpactFile,
  resolveChangeSet,
} from './lib/fmp-change.mjs'

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

const mirrors = loadMirrorMatrix(root, cfg)
const allFiles = walk(root, cfg.scan || {})
const architectureDocs = allFiles.filter(file =>
  file === (cfg.architecture?.overview || 'docs/architecture/overview.md')
  || file.startsWith(`${cfg.architecture?.moduleRoot || 'docs/architecture/modules'}/`))
const pendingSemanticDocs = architectureDocs.filter(file => readText(path.join(root, file)).includes('FMP:SEMANTIC_REVIEW_PENDING'))
if (pendingSemanticDocs.length) {
  const msg = `Architecture semantic review is incomplete: ${pendingSemanticDocs.join(', ')}`
  if (strict || cfg.enforcement?.semanticCompletion === 'fail') failures.push(msg)
  else warnings.push(msg)
}
for (const mirror of mirrors) {
  for (const doc of mirror.docs || []) {
    const file = doc.split('#')[0]
    if (!fs.existsSync(path.join(root, file))) {
      const msg = `Mirror ${mirror.id} references missing doc: ${file}`
      if (strict || cfg.enforcement?.staleReferences === 'fail') failures.push(msg)
      else warnings.push(msg)
    }
  }
  if (!(mirror.code || []).some(pattern => allFiles.some(file => globToRegex(pattern).test(file)))) {
    const msg = `Mirror ${mirror.id} has no files matching its code patterns.`
    if (strict || cfg.enforcement?.staleReferences === 'fail') failures.push(msg)
    else warnings.push(msg)
  }
}

const snapshotPath = path.join(root, cfg.architecture?.snapshot || '.fmp/architecture-snapshot.json')
if (!fs.existsSync(snapshotPath)) {
  const msg = `Missing architecture snapshot: ${path.relative(root, snapshotPath)}`
  if (strict || cfg.enforcement?.snapshotDrift === 'fail') failures.push(msg)
  else warnings.push(msg)
}
else {
  const freshSnapshot = buildArchitectureSnapshot(root, cfg)
  const expected = architectureSnapshotText(freshSnapshot)
  const current = readText(snapshotPath)
  if (current !== expected) {
    const msg = 'Architecture snapshot is stale. Run fmp-scan --write.'
    if (strict || cfg.enforcement?.snapshotDrift === 'fail') failures.push(msg)
    else warnings.push(msg)
  }
  const staleDocs = staleArchitectureDocs(root, cfg, freshSnapshot)
  if (staleDocs.length) {
    const msg = `Architecture managed facts are stale: ${staleDocs.join(', ')}`
    if (strict || cfg.enforcement?.snapshotDrift === 'fail') failures.push(msg)
    else warnings.push(msg)
  }
}

let changeSet = null
try {
  changeSet = resolveChangeSet(root, args, { strict })
}
catch (error) {
  if (strict) failures.push(error.message)
  else warnings.push(error.message)
}

if (changeSet && cfg.enforcement?.docSync === 'required-or-waiver') {
  const exempt = cfg.paths?.exempt || []
  const p0Patterns = cfg.paths?.p0 || []
  const changedP0 = changeSet.files
    .filter(file => matchesAny(file, p0Patterns))
    .filter(file => !matchesAny(file, exempt))
  const impacted = affectedMirrors(changedP0, mirrors)
  for (const file of changedP0) {
    if (!impacted.some(mirror => (mirror.code || []).some(pattern => globToRegex(pattern).test(file)))) {
      failures.push(`Changed P0 file is not mapped to a semantic mirror: ${file}`)
    }
  }
  const fingerprint = codeFingerprint(root, changeSet.baseCommit, changedP0)
  const impactPath = path.join(root, cfg.changeDetection?.impactFile || '.fmp/impact.yaml')
  const impact = parseImpactFile(impactPath)

  for (const mirror of impacted) {
    const changedDocs = (mirror.docs || []).filter(doc => changeSet.files.includes(doc.split('#')[0]))
    if (changedDocs.length) continue
    const waiver = impact?.waivers?.find(item => item.mirror === mirror.id)
    const validWaiver = impact?.baseCommit === changeSet.baseCommit
      && impact?.codeFingerprint === fingerprint
      && waiver?.disposition === 'no-doc-impact'
      && Boolean(waiver?.reason?.trim())
    if (!validWaiver) {
      failures.push(`P0 changes affect mirror ${mirror.id}, but no mapped doc changed and no current no-doc-impact waiver exists.`)
    }
  }
}

const p0Files = listP0CodeFiles(root, cfg)
const selectedP0Files = listSelectedP0Files(root, cfg)
const hasPersistedSelectedP0 = Array.isArray(cfg.l3Lite?.selectedFiles) && cfg.l3Lite.selectedFiles.length > 0
const requireAllP0L3 = l3RequiresAllP0(cfg)
const requireSelectedP0L3 = l3RequiresSelectedP0(cfg)
let anchored = 0
let selectedAnchored = 0

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
    if (requireAllP0L3) {
      if (strict || cfg.l3Lite?.failOnMissing) failures.push(msg)
      else warnings.push(msg)
    }
  }
}

for (const f of selectedP0Files) {
  if (hasL3Lite(readText(path.join(root, f)))) selectedAnchored++
  else if (requireSelectedP0L3) {
    const msg = `Missing L3-Lite in selected P0 file: ${f}`
    if (strict || cfg.l3Lite?.failOnMissing) failures.push(msg)
    else warnings.push(msg)
  }
}

if (requireSelectedP0L3 && !hasPersistedSelectedP0) {
  warnings.push('L3-Lite policy requires selected-p0 but l3Lite.selectedFiles is empty; using inferred candidates.')
}

if (requireSelectedP0L3 && selectedP0Files.length === 0) {
  warnings.push('L3-Lite policy requires selected-p0 but l3Lite.selectedFiles is empty or invalid.')
}

console.log('FMP Check')
console.log('')
console.log(`P0 code files: ${p0Files.length}`)
console.log(`Selected P0 files: ${selectedP0Files.length}`)
console.log(`Selected L3-Lite coverage: ${selectedAnchored}/${selectedP0Files.length}`)
console.log(`All P0 L3-Lite coverage: ${anchored}/${p0Files.length}`)
console.log(`L3-Lite policy: ${(cfg.l3Lite?.requiredFor || ['p0']).join(', ')}`)
if (changeSet) console.log(`Changed files (${changeSet.mode}): ${changeSet.files.length}`)

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
