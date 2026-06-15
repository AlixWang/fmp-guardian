#!/usr/bin/env node
import {
  loadConfig,
  parseArgs,
  rootFromArgs,
  runCommand,
} from './lib/fmp-utils.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const cfg = loadConfig(root)
const commands = cfg.checks?.commands || {}
const run = Boolean(args.run)

const names = Object.keys(commands)
console.log('# FMP Eval / Check Plan')
console.log('')
if (!names.length) {
  console.log('No check/eval commands configured in `.fmp/config.json`.')
  process.exit(0)
}

for (const name of names) {
  console.log(`- ${name}: \`${commands[name]}\``)
}

if (!run) {
  console.log('')
  console.log('Plan only. Re-run with --run to execute commands.')
  process.exit(0)
}

console.log('')
console.log('Running commands...')
for (const name of names) {
  console.log('')
  console.log(`## ${name}`)
  runCommand(commands[name])
}
