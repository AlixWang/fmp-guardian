#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  globToRegex,
  hasL3Lite,
  l3RequiresAllP0,
  l3RequiresSelectedP0,
  listP0CodeFiles,
  listSelectedP0Files,
  loadConfig,
  loadMirrorMatrix,
  parseArgs,
  readJson,
  readText,
  rootFromArgs,
  unique,
  walk,
} from './lib/fmp-utils.mjs'
import { architectureSnapshotText, buildArchitectureSnapshot, staleArchitectureDocs } from './lib/fmp-architecture.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const cfg = loadConfig(root)

const allFiles = walk(root, cfg.scan || {})
const agentDocs = allFiles.filter(f => path.basename(f) === 'AGENTS.md')
const rootAgentsPath = path.join(root, cfg.entryDocs?.primary || 'AGENTS.md')
const rootAgentsExists = fs.existsSync(rootAgentsPath)
const rootAgentsBytes = rootAgentsExists ? fs.statSync(rootAgentsPath).size : 0
const rootAgentsMax = cfg.agentsDocs?.maxRootBytes ?? 24000
const rootAgentsTooLarge = rootAgentsBytes > rootAgentsMax
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
const currentSnapshot = buildArchitectureSnapshot(root, cfg)
const snapshotCurrent = snapshotExists
  && readText(snapshotPath) === architectureSnapshotText(currentSnapshot)
const staleManagedDocs = staleArchitectureDocs(root, cfg, currentSnapshot)
const missingMirrorDocs = mirrors.flatMap(mirror => (mirror.docs || [])
  .map(doc => ({ mirror: mirror.id, doc: doc.split('#')[0] })))
  .filter(item => !fs.existsSync(path.join(root, item.doc)))
const architectureDocs = allFiles.filter(file =>
  file === (cfg.architecture?.overview || 'docs/architecture/overview.md')
  || file.startsWith(`${cfg.architecture?.moduleRoot || 'docs/architecture/modules'}/`))
const mirrorDocFiles = mirrors.flatMap(mirror => (mirror.docs || []).map(doc => doc.split('#')[0]))
const semanticReviewTargets = unique([...architectureDocs, ...mirrorDocFiles])
const pendingSemanticDocs = semanticReviewTargets
  .filter(file => fs.existsSync(path.join(root, file)))
  .filter(file => readText(path.join(root, file)).includes('FMP:SEMANTIC_REVIEW_PENDING'))
const mirrorsWithoutDocs = mirrors.filter(mirror => !(mirror.docs || []).length)
const mirrorsWithoutCode = mirrors.filter(mirror => !mirrorHasCode(mirror))
const unmappedP0Files = p0Files.filter(file => !mirrors.some(mirror =>
  (mirror.code || []).some(pattern => globToRegex(pattern).test(file))))
const commands = cfg.checks?.commands || {}
const evidencePath = path.join(root, cfg.checks?.evidenceFile || '.fmp/check-evidence.json')
const evidenceExists = fs.existsSync(evidencePath)
const evidenceState = checkEvidenceState()

console.log('# FMP Doctor')
console.log('')
console.log('## Protocol Stance')
console.log('- FMP role: semantic consistency protocol for agent-maintained codebases.')
console.log('- Extension rule: add detectors, validators, or routers before adding new source-of-truth files.')
console.log('- Default truth chain: P0 code path -> mirror matrix -> semantic mirror -> semantic block or current waiver -> check/eval evidence -> strict gate.')
console.log('')
console.log('## Project')
console.log(`- Name: ${cfg.project?.name || 'unknown'}`)
console.log(`- Type: ${cfg.project?.type || 'unknown'}`)
console.log(`- Languages: ${(cfg.project?.languages || []).join(', ') || 'unknown'}`)
console.log('')
console.log('## Coverage')
console.log(`- Root AGENTS.md: ${rootAgentsExists ? rootAgentsTooLarge ? `NOISY (${rootAgentsBytes}/${rootAgentsMax} bytes)` : 'OK' : 'MISSING'}`)
console.log(`- Nested AGENTS.md: ${Math.max(0, agentDocs.length - 1)}`)
console.log(`- Mirror matrix: ${fs.existsSync(matrixPath) ? 'OK' : 'MISSING'}`)
console.log(`- Architecture snapshot: ${snapshotCurrent ? 'CURRENT' : snapshotExists ? 'STALE' : 'MISSING'}`)
console.log(`- Architecture overview: ${fs.existsSync(path.join(root, cfg.architecture?.overview || 'docs/architecture/overview.md')) ? 'OK' : 'MISSING'}`)
console.log(`- Pending semantic reviews: ${pendingSemanticDocs.length}`)
console.log(`- Stale managed architecture docs: ${staleManagedDocs.length}`)
console.log(`- Mirrors without docs: ${mirrorsWithoutDocs.length}`)
console.log(`- Mirrors without matching code: ${mirrorsWithoutCode.length}`)
console.log(`- Unmapped P0 code files: ${unmappedP0Files.length}`)
console.log(`- P0 patterns: ${(cfg.paths?.p0 || []).length}`)
console.log(`- P0 code files: ${p0Files.length}`)
console.log(`- Selected P0 files: ${selectedP0Files.length}`)
console.log(`- Selected L3-Lite anchors: ${selectedAnchored.length}/${selectedP0Files.length}`)
console.log(`- All P0 L3-Lite anchors: ${anchored.length}/${p0Files.length}`)
console.log(`- L3-Lite policy: ${(cfg.l3Lite?.requiredFor || ['p0']).join(', ')}`)
console.log('')
console.log('## Conformance')
console.log(`- Mirror conformance: ${mirrorConformance()}`)
console.log(`- Architecture conformance: ${architectureConformance()}`)
console.log(`- Semantic conformance: ${pendingSemanticDocs.length ? `PENDING (${pendingSemanticDocs.length})` : 'REVIEWED'}`)
console.log(`- Agent-entry conformance: ${agentConformance()}`)
console.log(`- P0 mapping conformance: ${unmappedP0Files.length ? `DEBT (${unmappedP0Files.length} unmapped)` : 'OK'}`)
console.log(`- Eval/check conformance: ${evalConformance()}`)
console.log('')
console.log('## Reality Check')
console.log(`- Architecture drift: ${architectureDrift()}`)
console.log(`- Semantic mirror drift: ${semanticDrift()}`)
console.log(`- P0 mapping drift: ${unmappedP0Files.length ? `${unmappedP0Files.length} P0 file(s) have no mirror binding` : 'none detected'}`)
console.log(`- Agent instruction drift: ${agentInstructionDrift()}`)
console.log(`- Eval/check drift: ${evalDrift()}`)
console.log('')
console.log('## Commands')
if (Object.keys(commands).length) {
  for (const [name, cmd] of Object.entries(commands)) console.log(`- ${name}: \`${cmd}\``)
}
else {
  console.log('- No commands detected.')
}
console.log('')
console.log('## Debt')
const debt = []
if (!rootAgentsExists) debt.push(`Create root ${path.relative(root, rootAgentsPath) || 'AGENTS.md'}.`)
if (rootAgentsTooLarge) debt.push(`Reduce root agent entry noise: ${rootAgentsBytes} bytes exceeds configured max ${rootAgentsMax}.`)
if (!fs.existsSync(matrixPath)) debt.push('Create .fmp/mirror-matrix.yaml.')
if (requireAllP0L3 && anchored.length < p0Files.length) debt.push(`Add L3-Lite to P0 files or relax P0 patterns. Missing: ${p0Files.length - anchored.length}.`)
if (requireSelectedP0L3 && !hasPersistedSelectedP0) debt.push('Persist reviewed selected P0 files in l3Lite.selectedFiles.')
if (requireSelectedP0L3 && selectedP0Files.length === 0) debt.push('Populate l3Lite.selectedFiles or change l3Lite.requiredFor.')
if (requireSelectedP0L3 && selectedAnchored.length < selectedP0Files.length) debt.push(`Add L3-Lite to selected P0 files. Missing: ${selectedP0Files.length - selectedAnchored.length}.`)
if (missingDocMarkers) debt.push(`Some mirror entries have no semantic docs detected. Review mirror matrix.`)
for (const mirror of mirrorsWithoutDocs) debt.push(`Mirror ${mirror.id} has no semantic docs mapped.`)
for (const mirror of mirrorsWithoutCode) debt.push(`Mirror ${mirror.id} has no matching code files.`)
if (unmappedP0Files.length) {
  debt.push(`Map ${unmappedP0Files.length} P0 code file(s) to semantic mirrors. Examples: ${unmappedP0Files.slice(0, 5).join(', ')}.`)
}
if (!snapshotExists) debt.push('Generate the architecture snapshot with fmp-scan --write.')
else if (!snapshotCurrent) debt.push('Architecture snapshot is stale; refresh it and review affected docs.')
for (const item of missingMirrorDocs) debt.push(`Mirror ${item.mirror} references missing doc ${item.doc}.`)
if (pendingSemanticDocs.length) debt.push(`Complete agent semantic review in ${pendingSemanticDocs.length} mapped architecture/mirror document(s).`)
if (staleManagedDocs.length) debt.push(`Refresh deterministic facts in ${staleManagedDocs.length} architecture document(s).`)
if (evidenceState.problems.length) debt.push(`Repair check/eval evidence: ${evidenceState.problems.slice(0, 3).join('; ')}.`)
if (agentDocs.length > 12) debt.push(`Many AGENTS.md files detected (${agentDocs.length}). Consider pruning nested docs.`)

if (debt.length) {
  for (const d of debt) console.log(`- ${d}`)
}
else {
  console.log('- No obvious FMP debt detected.')
}

function mirrorHasCode(mirror) {
  return (mirror.code || []).some(pattern => allFiles.some(file => globToRegex(pattern).test(file)))
}

function mirrorConformance() {
  const problems = missingDocMarkers + mirrorsWithoutDocs.length + missingMirrorDocs.length + mirrorsWithoutCode.length
  return problems ? `DEBT (${problems} issue(s))` : 'OK'
}

function architectureConformance() {
  if (!snapshotExists) return 'MISSING'
  if (!snapshotCurrent) return 'STALE'
  if (staleManagedDocs.length) return `STALE DOCS (${staleManagedDocs.length})`
  return 'CURRENT'
}

function agentConformance() {
  if (!rootAgentsExists) return 'MISSING'
  if (rootAgentsTooLarge) return 'NOISY'
  if (agentDocs.length > 12) return `NOISY (${agentDocs.length} AGENTS.md files)`
  return 'OK'
}

function evalConformance() {
  if (!Object.keys(commands).length) return 'NO COMMANDS CONFIGURED'
  return evidenceState.conformance
}

function architectureDrift() {
  if (!snapshotExists) return 'snapshot missing'
  if (!snapshotCurrent) return 'snapshot stale'
  if (staleManagedDocs.length) return `${staleManagedDocs.length} managed architecture doc(s) stale`
  return 'none detected'
}

function semanticDrift() {
  const items = []
  if (pendingSemanticDocs.length) items.push(`${pendingSemanticDocs.length} pending semantic review(s)`)
  if (missingMirrorDocs.length) items.push(`${missingMirrorDocs.length} missing mapped doc(s)`)
  if (mirrorsWithoutDocs.length) items.push(`${mirrorsWithoutDocs.length} mirror(s) without docs`)
  return items.length ? items.join('; ') : 'none detected'
}

function agentInstructionDrift() {
  if (!rootAgentsExists) return 'root agent guide missing'
  if (rootAgentsTooLarge) return 'root agent guide exceeds configured size'
  if (agentDocs.length > 12) return `${agentDocs.length} AGENTS.md files detected`
  return 'none detected'
}

function evalDrift() {
  if (!Object.keys(commands).length) return 'no project checks/evals configured'
  return evidenceState.drift
}

function checkEvidenceState() {
  if (!Object.keys(commands).length) {
    return { conformance: 'NO COMMANDS CONFIGURED', drift: 'no project checks/evals configured', problems: [] }
  }
  if (!evidenceExists) {
    return {
      conformance: 'COMMANDS CONFIGURED; EVIDENCE CREATED BY fmp-eval --run',
      drift: 'evidence not recorded yet; strict P0 changes require fmp-eval --run',
      problems: [],
    }
  }

  const evidence = readJson(evidencePath)
  const problems = []
  if (!evidence || typeof evidence !== 'object') {
    problems.push('evidence file is not valid JSON')
  }
  else {
    const completedAt = Date.parse(evidence.completedAt || '')
    if (!Number.isFinite(completedAt)) problems.push('evidence has no valid completedAt timestamp')
    else if (completedAt > Date.now() + 300000) problems.push('evidence completedAt is in the future')
    if (!evidence.baseCommit) problems.push('evidence has no baseCommit')
    if (!evidence.codeFingerprint) problems.push('evidence has no codeFingerprint')
    if (!evidence.commandsFingerprint) problems.push('evidence has no commandsFingerprint')
    const runs = Array.isArray(evidence.runs) ? evidence.runs : []
    if (!Array.isArray(evidence.runs)) problems.push('evidence runs is missing or invalid')
    for (const [name, command] of Object.entries(commands)) {
      const run = runs.find(item => item?.name === name && item?.command === command)
      if (!run) {
        problems.push(`missing command result for ${name}`)
        continue
      }
      if (run.status !== 0) problems.push(`${name} exited with status ${run.status}`)
    }
  }

  if (problems.length) {
    return {
      conformance: `RECORDED WITH WARNINGS (${problems.length})`,
      drift: problems.slice(0, 5).join('; '),
      problems,
    }
  }
  return {
    conformance: 'RECORDED; STRICT FRESHNESS VERIFIED BY fmp-check',
    drift: `evidence recorded at ${path.relative(root, evidencePath)}; strict freshness verified by fmp-check`,
    problems,
  }
}
