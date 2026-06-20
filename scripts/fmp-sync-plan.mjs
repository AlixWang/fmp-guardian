#!/usr/bin/env node
import path from 'node:path'
import {
  globToRegex,
  loadConfig,
  loadMirrorMatrix,
  parseArgs,
  rootFromArgs,
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
