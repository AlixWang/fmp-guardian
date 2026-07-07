#!/usr/bin/env node
import path from 'node:path'
import {
  globToRegex,
  loadConfig,
  loadMirrorMatrix,
  matchesAny,
  normalize,
  parseArgs,
  rootFromArgs,
  walk,
} from './lib/fmp-utils.mjs'
import {
  affectedMirrors,
  codeFingerprint,
  resolveChangeSet,
  writeImpactFile,
} from './lib/fmp-change.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const decision = args._.join(' ') || args.decision || 'Unspecified design/code change'
const cfg = loadConfig(root)
const changed = []
let baseCommit = ''
if (args.changed) {
  changed.push(...String(args.changed).split(',').map(s => s.trim()).filter(Boolean))
  try { baseCommit = resolveChangeSet(root, args).baseCommit }
  catch { /* A manually supplied file list can still produce a review-only plan. */ }
}
else {
  try {
    const changeSet = resolveChangeSet(root, args)
    changed.push(...changeSet.files)
    baseCommit = changeSet.baseCommit
  }
  catch {
    // A decision-only sync plan remains useful outside a Git worktree.
  }
}

const mirrorBlocks = loadMirrorMatrix(root, cfg)
const matched = changed.length
  ? affectedMirrors(changed, mirrorBlocks)
  : mirrorBlocks.filter(m => keywordMatch(decision, m))
const unmatchedChanged = changed.filter(file => !matched.some(mirror =>
  (mirror.code || []).some(pattern => globToRegex(pattern).test(file))))
const unmatchedP0 = unmatchedChanged
  .filter(file => matchesAny(file, cfg.paths?.p0 || []))
  .filter(file => !matchesAny(file, cfg.paths?.exempt || []))
const fallbackCandidates = !changed.length && !matched.length

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
const targets = matched.length ? matched : fallbackCandidates ? mirrorBlocks.slice(0, 5) : []
if (targets.length) {
  if (fallbackCandidates) {
    console.log('- No mirror matched by decision keywords. Review these candidates before editing:')
    console.log('')
  }
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
}
else {
  console.log('- No mirror matched the supplied changed files.')
  console.log('- Review `.fmp/mirror-matrix.yaml`; do not use a no-doc-impact waiver to hide an unmapped P0 path.')
  console.log('')
}
if (unmatchedChanged.length) {
  console.log('## Unmapped Changed Files')
  console.log('')
  for (const file of unmatchedChanged) console.log(`- \`${file}\``)
  if (unmatchedP0.length) {
    console.log('')
    console.log('P0 files with no mirror binding:')
    for (const file of unmatchedP0) console.log(`- \`${file}\``)
  }
  console.log('')
}
console.log('## Recommended Context')
console.log('')
for (const item of recommendedContext(targets, changed, cfg, root)) console.log(`- \`${item}\``)
console.log('')
console.log('## Source-of-truth Guard')
console.log('')
console.log('- Treat inferred matches, dependency edges, graphs, and memories as detector evidence.')
console.log('- Keep `.fmp/mirror-matrix.yaml`, architecture semantic blocks, ADRs, and check evidence as the authoritative sync chain.')
console.log('- If a new capability is needed, add it as a detector, validator, or router before adding a new source-of-truth file.')
console.log('')
console.log('## Required FMP Actions')
console.log('')
console.log('- Review matched semantic mirrors before implementation.')
if (unmatchedP0.length) console.log('- Map unmapped P0 files to a semantic mirror before relying on the sync plan.')
console.log('- Update docs if behavior, public contracts, state transitions, permissions, persistence, prompts, or eval expectations change.')
console.log('- Run relevant project checks/evals from `.fmp/config.json`.')
console.log('- Report remaining FMP debt.')

if (args['write-impact']) {
  const impactPath = path.join(root, cfg.changeDetection?.impactFile || '.fmp/impact.yaml')
  const affectedFiles = changed.filter(file => matched.some(mirror =>
    (mirror.code || []).some(pattern => globToRegex(pattern).test(file))))
  const fingerprint = codeFingerprint(root, baseCommit || 'manual', affectedFiles)
  writeImpactFile(impactPath, {
    baseCommit: baseCommit || 'manual',
    codeFingerprint: fingerprint,
    mirrors: matched.map(mirror => ({
      id: mirror.id,
      changedFiles: affectedFiles.filter(file => (mirror.code || []).some(pattern => globToRegex(pattern).test(file))),
    })),
  })
  console.log(`- Wrote impact record: \`${path.relative(root, impactPath)}\``)
}

function keywordMatch(text, mirror) {
  const t = text.toLowerCase()
  const hay = [mirror.id, ...(mirror.code || []), ...(mirror.docs || []), ...(mirror.sync_when || [])].join(' ').toLowerCase()
  return t.split(/\W+/).filter(w => w.length > 3).some(w => hay.includes(w))
}

function recommendedContext(targets, changed, cfg, root) {
  const out = [
    cfg.entryDocs?.primary || 'AGENTS.md',
    '.fmp/config.json',
    cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml',
  ]
  if (changed.length) out.push(...changed.slice(0, 20).map(normalize))
  for (const mirror of targets) {
    for (const doc of mirror.docs || []) out.push(doc.split('#')[0])
  }
  out.push(...adrDocs(root, cfg))
  out.push(cfg.architecture?.snapshot || '.fmp/architecture-snapshot.json')
  const commands = cfg.checks?.commands || {}
  if (Object.keys(commands).length) out.push(cfg.checks?.evidenceFile || '.fmp/check-evidence.json')
  return uniqueKeep(out)
}

function adrDocs(root, cfg) {
  return walk(root, cfg.scan || {})
    .filter(file => /^docs\/adr\/[^/].*\.mdx?$/.test(file))
    .slice(0, 20)
}

function uniqueKeep(values) {
  const seen = new Set()
  const out = []
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}
