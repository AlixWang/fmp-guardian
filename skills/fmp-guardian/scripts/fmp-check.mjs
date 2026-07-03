#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  globToRegex,
  extractL3,
  hasL3Lite,
  inferExports,
  inferMirrorIdForFile,
  l3RequiresAllP0,
  l3RequiresSelectedP0,
  l3Fields,
  listP0CodeFiles,
  listSelectedP0Files,
  loadConfig,
  loadMirrorMatrix,
  matchesAny,
  parseArgs,
  parseSimpleMirrors,
  readJson,
  readText,
  rootFromArgs,
  unique,
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
  fmpSemanticBlocksChanged,
  parseImpactFile,
  readGitFile,
  resolveChangeSet,
  valueFingerprint,
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
let effectiveMirrors = mirrors
const allFiles = walk(root, cfg.scan || {})
let mirrorIds = new Set(effectiveMirrors.map(mirror => mirror.id))
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
  if (!(mirror.docs || []).length) {
    const msg = `Mirror ${mirror.id} has no semantic docs mapped.`
    if (strict || cfg.enforcement?.staleReferences === 'fail') failures.push(msg)
    else warnings.push(msg)
  }
  for (const doc of mirror.docs || []) {
    const file = doc.split('#')[0]
    if (!fs.existsSync(path.join(root, file))) {
      const msg = `Mirror ${mirror.id} references missing doc: ${file}`
      if (strict || cfg.enforcement?.staleReferences === 'fail') failures.push(msg)
      else warnings.push(msg)
    }
    else if (!pendingSemanticDocs.includes(file) && readText(path.join(root, file)).includes('FMP:SEMANTIC_REVIEW_PENDING')) {
      const msg = `Mirror ${mirror.id} doc has incomplete semantic review: ${file}`
      if (strict || cfg.enforcement?.semanticCompletion === 'fail') failures.push(msg)
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

const baseCfg = changeSet ? loadBaseConfig(changeSet.baseCommit) : null
const baseMirrors = changeSet ? loadBaseMirrors(baseCfg, changeSet.baseCommit) : []
effectiveMirrors = mergeMirrors([...baseMirrors, ...mirrors, fmpPolicyMirror()])
mirrorIds = new Set(effectiveMirrors.map(mirror => mirror.id))
const effectiveCommands = effectiveCommandEntries(baseCfg?.checks?.commands || {}, cfg.checks?.commands || {})
const effectiveP0Patterns = effectivePatterns(baseCfg, cfg, 'p0')
const effectiveExemptPatterns = effectivePatterns(baseCfg, cfg, 'exempt')
const docSyncRequired = cfg.enforcement?.docSync === 'required-or-waiver'
  || baseCfg?.enforcement?.docSync === 'required-or-waiver'

if (changeSet && docSyncRequired) {
  const { changedP0, impacted } = p0Impact(changeSet.files)
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
    const meaningfulDocs = changedDocs.filter(doc => fmpSemanticBlocksChanged(root, changeSet.baseCommit, doc.split('#')[0]))
    if (meaningfulDocs.length) continue
    if (changedDocs.length) {
      failures.push(`P0 changes affect mirror ${mirror.id}, but mapped docs changed only outside FMP semantic blocks: ${changedDocs.map(doc => doc.split('#')[0]).join(', ')}`)
      continue
    }
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

if (changeSet) {
  const { changedP0 } = p0Impact(changeSet.files)
  if (changedP0.length && effectiveCommands.length) {
    const evidencePath = path.join(root, cfg.checks?.evidenceFile || '.fmp/check-evidence.json')
    const evidence = readJson(evidencePath)
    const evidenceProblems = checkEvidenceProblems(evidence, effectiveCommands, changedP0)
    for (const problem of evidenceProblems) {
      const msg = `Check/eval evidence problem: ${problem}`
      if (strict || cfg.enforcement?.checkEvidence === 'fail') failures.push(msg)
      else warnings.push(msg)
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
    const fields = l3Fields(content)
    const mirrorRef = fields.MIRROR || ''
    const mirrorId = mirrorRef.includes('#') ? mirrorRef.split('#').pop() : mirrorRef
    if (!mirrorId || !mirrorIds.has(mirrorId)) {
      const msg = `L3-Lite in ${f} points to an unknown mirror: ${mirrorRef || '<missing>'}`
      if (strict || cfg.l3Lite?.failOnInvalidMirror) failures.push(msg)
      else warnings.push(msg)
    }
    else {
      const inferredMirrorId = inferMirrorIdForFile(f, effectiveMirrors)
      if (mirrorId !== inferredMirrorId) {
        const msg = `L3-Lite in ${f} points to ${mirrorId}, but mirror matrix maps it to ${inferredMirrorId}.`
        if (strict || cfg.l3Lite?.failOnMirrorMismatch) failures.push(msg)
        else warnings.push(msg)
      }
    }
    const currentExports = inferExports(f, root)
    if (fields.EXPORT && fields.EXPORT !== currentExports) {
      const msg = `L3-Lite export summary may be stale in ${f}: expected "${currentExports}".`
      if ((strict && changeSet?.files?.includes(f)) || cfg.l3Lite?.failOnStaleExport) failures.push(msg)
      else warnings.push(msg)
    }
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

function p0Impact(files) {
  const changedP0 = files
    .filter(file => isProtectedPolicyFile(file) || matchesAny(file, effectiveP0Patterns))
    .filter(file => isProtectedPolicyFile(file) || !matchesAny(file, effectiveExemptPatterns))
  return { changedP0, impacted: affectedMirrors(changedP0, effectiveMirrors) }
}

function checkEvidenceProblems(evidence, commandEntries, changedP0) {
  if (!evidence) return [`missing ${cfg.checks?.evidenceFile || '.fmp/check-evidence.json'}; run fmp-eval --run`]
  const problems = []
  const runs = Array.isArray(evidence.runs) ? evidence.runs : []
  const completedAt = Date.parse(evidence.completedAt || '')
  const now = Date.now()
  if (!Number.isFinite(completedAt)) problems.push('evidence has no valid completedAt timestamp')
  else if (completedAt > now + 300000) problems.push('evidence completedAt is in the future')
  const expectedCodeFingerprint = codeFingerprint(root, changeSet.baseCommit, changedP0)
  const expectedCommandsFingerprint = valueFingerprint(commandEntries.map(({ key, name, command }) => ({ key, name, command })))
  if (evidence.baseCommit !== changeSet.baseCommit) problems.push('evidence baseCommit does not match current change set')
  if (evidence.codeFingerprint !== expectedCodeFingerprint) problems.push('evidence codeFingerprint does not match changed P0 files')
  if (evidence.commandsFingerprint !== expectedCommandsFingerprint) problems.push('evidence commandsFingerprint does not match configured commands')
  for (const entry of commandEntries) {
    const run = runs.find(item => item.key === entry.key || (item.name === entry.name && item.command === entry.command))
    if (!run) {
      problems.push(`missing command result for ${entry.name}`)
      continue
    }
    if (run.status !== 0) problems.push(`${entry.name} exited with status ${run.status}`)
  }
  const newestChangedAt = Math.max(0, ...changedP0.map(file => {
    const full = path.join(root, file)
    return fs.existsSync(full) ? fs.statSync(full).mtimeMs : 0
  }))
  if (Number.isFinite(completedAt) && newestChangedAt && completedAt + 1000 < newestChangedAt) {
    problems.push('evidence is older than changed P0 files')
  }
  return problems
}

function loadBaseConfig(baseCommit) {
  const text = readGitFile(root, baseCommit, '.fmp/config.json')
  if (!text) return null
  try { return JSON.parse(text) }
  catch { return null }
}

function loadBaseMirrors(baseConfig, baseCommit) {
  const matrixFile = baseConfig?.mirrorMatrix || cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml'
  return parseSimpleMirrors(readGitFile(root, baseCommit, matrixFile) || '')
}

function effectivePatterns(baseConfig, currentConfig, key) {
  return unique([
    ...((baseConfig?.paths?.[key]) || []),
    ...((currentConfig?.paths?.[key]) || []),
    ...(key === 'p0' ? protectedPolicyFiles() : []),
  ])
}

function effectiveCommandEntries(baseCommands, currentCommands) {
  const entries = []
  const seen = new Set()
  for (const [source, commands] of [['base', baseCommands], ['current', currentCommands]]) {
    for (const [name, command] of Object.entries(commands || {})) {
      const key = `${name}\0${command}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ key: valueFingerprint({ name, command }), name, command, source })
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key))
}

function mergeMirrors(items) {
  const byId = new Map()
  for (const mirror of items.filter(Boolean)) {
    if (!mirror.id) continue
    if (!byId.has(mirror.id)) byId.set(mirror.id, { id: mirror.id, code: [], docs: [], evals: [], sync_when: [] })
    const target = byId.get(mirror.id)
    target.code.push(...(mirror.code || []))
    target.docs.push(...(mirror.docs || []))
    target.evals.push(...(mirror.evals || []))
    target.sync_when.push(...(mirror.sync_when || []))
  }
  return [...byId.values()].map(mirror => ({
    ...mirror,
    code: unique(mirror.code),
    docs: unique(mirror.docs),
    evals: unique(mirror.evals),
    sync_when: unique(mirror.sync_when),
  }))
}

function fmpPolicyMirror() {
  return {
    id: 'fmp-policy',
    code: protectedPolicyFiles(),
    docs: [cfg.architecture?.overview || 'docs/architecture/overview.md'],
    evals: [],
    sync_when: ['FMP policy, mirror matrix, enforcement, or check command changed'],
  }
}

function protectedPolicyFiles() {
  return ['.fmp/config.json', '.fmp/mirror-matrix.yaml']
}

function isProtectedPolicyFile(file) {
  return protectedPolicyFiles().includes(file)
}
