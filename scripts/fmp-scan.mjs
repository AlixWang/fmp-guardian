#!/usr/bin/env node
import path from 'node:path'
import { buildArchitectureSnapshot, architectureSnapshotText, staleArchitectureDocs, syncArchitectureDocs, writeArchitectureSnapshot } from './lib/fmp-architecture.mjs'
import { loadConfig, parseArgs, rootFromArgs } from './lib/fmp-utils.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const cfg = loadConfig(root)
const snapshot = buildArchitectureSnapshot(root, cfg)
const target = path.join(root, cfg.architecture?.snapshot || '.fmp/architecture-snapshot.json')

if (args.check) {
  const fs = await import('node:fs')
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
  const staleDocs = staleArchitectureDocs(root, cfg, snapshot)
  if (current !== architectureSnapshotText(snapshot) || staleDocs.length) {
    if (current !== architectureSnapshotText(snapshot)) console.error('Architecture snapshot is stale. Run fmp-scan --write.')
    if (staleDocs.length) console.error(`Architecture managed facts are stale: ${staleDocs.join(', ')}`)
    process.exitCode = 1
  }
  else console.log('Architecture snapshot is current.')
}
else if (args.write) {
  syncArchitectureDocs(root, cfg, snapshot)
  writeArchitectureSnapshot(target, buildArchitectureSnapshot(root, cfg))
  console.log(`Wrote ${path.relative(root, target)}`)
}
else {
  process.stdout.write(architectureSnapshotText(snapshot))
}
