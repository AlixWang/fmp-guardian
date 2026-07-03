#!/usr/bin/env node
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  loadConfig,
  matchesAny,
  parseArgs,
  rootFromArgs,
  unique,
  writeJson,
} from './lib/fmp-utils.mjs'
import {
  codeFingerprint,
  readGitFile,
  resolveChangeSet,
  valueFingerprint,
} from './lib/fmp-change.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const cfg = loadConfig(root)
const run = Boolean(args.run)
let changeSet = null
try {
  changeSet = resolveChangeSet(root, args)
}
catch {
  changeSet = { baseCommit: 'manual', files: [], mode: 'manual' }
}
const baseCfg = loadBaseConfig(changeSet.baseCommit)
const commandEntries = effectiveCommandEntries(baseCfg?.checks?.commands || {}, cfg.checks?.commands || {})
const changedP0 = p0Files(changeSet.files, baseCfg, cfg)

console.log('# FMP Eval / Check Plan')
console.log('')
if (!commandEntries.length) {
  console.log('No check/eval commands configured in `.fmp/config.json`.')
  process.exit(0)
}

for (const entry of commandEntries) {
  console.log(`- ${entry.name}: \`${entry.command}\``)
}

if (!run) {
  console.log('')
  console.log('Plan only. Re-run with --run to execute commands.')
  process.exit(0)
}

console.log('')
console.log('Running commands...')
const evidence = {
  version: '0.2',
  baseCommit: changeSet.baseCommit,
  codeFingerprint: codeFingerprint(root, changeSet.baseCommit, changedP0),
  commandsFingerprint: valueFingerprint(commandEntries.map(({ key, name, command }) => ({ key, name, command }))),
  startedAt: new Date().toISOString(),
  completedAt: '',
  runs: [],
}
for (const entry of commandEntries) {
  console.log('')
  console.log(`## ${entry.name}`)
  const started = Date.now()
  const result = spawnSync(entry.command, {
    cwd: root,
    env: process.env,
    shell: true,
    stdio: 'inherit',
  })
  const status = result.status ?? 1
  evidence.runs.push({
    key: entry.key,
    name: entry.name,
    command: entry.command,
    status,
    signal: result.signal || null,
    durationMs: Date.now() - started,
  })
  if (status !== 0) process.exitCode = status
}
evidence.completedAt = new Date().toISOString()
const evidencePath = path.join(root, cfg.checks?.evidenceFile || '.fmp/check-evidence.json')
writeJson(evidencePath, evidence)
console.log('')
console.log(`Wrote ${path.relative(root, evidencePath)}`)

function loadBaseConfig(baseCommit) {
  const text = readGitFile(root, baseCommit, '.fmp/config.json')
  if (!text) return null
  try { return JSON.parse(text) }
  catch { return null }
}

function effectiveCommandEntries(baseCommands, currentCommands) {
  const entries = []
  const seen = new Set()
  for (const [source, commands] of [['base', baseCommands], ['current', currentCommands]]) {
    for (const [name, command] of Object.entries(commands || {})) {
      const dedupeKey = `${name}\0${command}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      entries.push({ key: valueFingerprint({ name, command }), name, command, source })
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key))
}

function p0Files(files, baseConfig, currentConfig) {
  const p0 = unique([
    ...((baseConfig?.paths?.p0) || []),
    ...((currentConfig?.paths?.p0) || []),
    ...protectedPolicyFiles(),
  ])
  const exempt = unique([
    ...((baseConfig?.paths?.exempt) || []),
    ...((currentConfig?.paths?.exempt) || []),
  ])
  return files
    .filter(file => protectedPolicyFiles().includes(file) || matchesAny(file, p0))
    .filter(file => protectedPolicyFiles().includes(file) || !matchesAny(file, exempt))
}

function protectedPolicyFiles() {
  return ['.fmp/config.json', '.fmp/mirror-matrix.yaml']
}
