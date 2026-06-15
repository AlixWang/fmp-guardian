#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  buildCommandsBlock,
  buildMirrorMatrix,
  buildProjectMap,
  classify,
  DEFAULT_IGNORES,
  detectChecks,
  detectDocs,
  detectProject,
  parseArgs,
  readText,
  rootFromArgs,
  selectP0Files,
  unique,
  walk,
  writeJson,
  writeText,
  yamlString,
} from './lib/fmp-utils.mjs'

const args = parseArgs()
const root = rootFromArgs(args)
const dryRun = Boolean(args['dry-run'])
const createClaude = args.claude !== false
const seedL3 = Boolean(args['seed-l3'])
const writeModuleAgents = Boolean(args['write-module-agents'])

const files = walk(root)
const project = detectProject(root, files)
const classification = classify(files)
const docs = detectDocs(files)
const commands = detectChecks(project, root)
const mirrors = buildMirrorMatrix(classification, docs)

const fmpDir = path.join(root, '.fmp')
const configPath = path.join(fmpDir, 'config.json')
const matrixPath = path.join(fmpDir, 'mirror-matrix.yaml')
const statusPath = path.join(fmpDir, 'status.md')
const agentsPath = path.join(root, 'AGENTS.md')
const claudePath = path.join(root, 'CLAUDE.md')

const config = {
  version: '0.1',
  project: {
    name: project.name,
    type: project.type,
    languages: project.languages,
    packageManagers: project.packageManagers,
    frameworks: project.frameworks,
  },
  entryDocs: {
    primary: 'AGENTS.md',
    compat: createClaude ? { claude: 'CLAUDE.md' } : {},
  },
  docs: {
    roots: project.docs.filter(d => !d.endsWith('.md')),
    designDocs: docs.designDocs,
    behaviorSpecs: docs.behaviorSpecs,
    apiDocs: docs.apiDocs,
  },
  paths: {
    p0: classification.p0,
    p1: classification.p1,
    exempt: [
      '**/*.gen.*',
      '**/*.generated.*',
      '**/*.snap',
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.wrangler/**',
      '**/target/**',
      '**/__pycache__/**',
      '**/vendor/**',
    ],
  },
  scan: {
    ignoredDirs: [...DEFAULT_IGNORES].sort(),
  },
  l3Lite: {
    enabled: true,
    requiredFor: ['selected-p0'],
    selectedFiles: [],
    candidateLimit: 30,
    maxLines: 6,
    requiredTags: ['FMP', 'MIRROR', 'EXPORT', 'CHECK'],
    failOnMissing: false,
  },
  agentsDocs: {
    maxRootBytes: 24000,
    maxModuleBytes: 12000,
    allowNested: true,
    nestedOnlyFor: ['p0-boundary', 'package-boundary', 'service-boundary'],
  },
  mirrorMatrix: '.fmp/mirror-matrix.yaml',
  checks: {
    commands,
  },
}
config.l3Lite.selectedFiles = selectP0Files(root, config)

const matrixYaml = `version: 0.1

mirrors:
${mirrors.length ? yamlString(mirrors, 2) : '  []'}
`

const projectMap = buildProjectMap(project, classification)
const commandsBlock = buildCommandsBlock(commands)
const agentsContent = `# Project Agent Guide

This project uses FMP: Fractal Mirror Protocol.

FMP keeps code facts and semantic mirrors aligned.

## Agent Entry Rules

1. Read this file before modifying code.
2. Read \`.fmp/config.json\` for project-specific FMP rules.
3. Read \`.fmp/mirror-matrix.yaml\` before changing P0 paths.
4. For files with L3-Lite headers, follow their \`[MIRROR]\` and \`[CHECK]\` instructions.
5. Behavior changes must update the matching semantic mirror.
6. Do not create nested \`AGENTS.md\` unless the directory is a package, service, or P0 architecture boundary.

## Project Map

<!-- FMP:PROJECT_MAP_START -->
${projectMap}
<!-- FMP:PROJECT_MAP_END -->

## Commands

<!-- FMP:COMMANDS_START -->
${commandsBlock}
<!-- FMP:COMMANDS_END -->

## FMP Policy

- Root \`AGENTS.md\` is the primary agent instruction file.
- \`CLAUDE.md\`, if present, should import or point to \`AGENTS.md\`.
- Only selected P0 files in \`l3Lite.selectedFiles\` should receive L3-Lite anchors by default.
- Generated files and trivial files should not receive L3-Lite.
- \`.fmp/mirror-matrix.yaml\` is the source of truth for code/document/eval synchronization.

## Final Response Requirement

When modifying code, report:

- Code files changed
- Semantic mirrors checked or changed
- Tests/evals/checks run
- Remaining FMP debt
`

const claudeContent = `@AGENTS.md

## Claude Code Compatibility

This file exists only as a Claude Code entry shim.
The primary project agent guide is \`AGENTS.md\`.

Before changing P0 paths, also read:

- \`.fmp/config.json\`
- \`.fmp/mirror-matrix.yaml\`
`

const status = `# FMP Status

Generated: ${new Date().toISOString()}

## Detected Project

- Name: ${project.name}
- Type: ${project.type}
- Languages: ${project.languages.join(', ') || 'unknown'}
- Package managers: ${project.packageManagers.join(', ') || 'unknown'}
- Frameworks: ${project.frameworks.join(', ') || 'none detected'}

## Coverage

- Root AGENTS.md: ${fs.existsSync(agentsPath) ? 'existing or updated' : 'created'}
- Mirror matrix: generated
- P0 pattern candidates: ${classification.p0.length}
- P1 pattern candidates: ${classification.p1.length}
- Selected P0 files: ${config.l3Lite.selectedFiles.length}

## Selected P0

${config.l3Lite.selectedFiles.length ? config.l3Lite.selectedFiles.slice(0, 30).map(f => `- \`${f}\``).join('\n') : '- No selected P0 files were inferred. Review `.fmp/config.json` and add `l3Lite.selectedFiles` manually.'}

## FMP Debt

${mirrors.filter(m => !m.docs?.length).map(m => `- Mirror \`${m.id}\` has no detected semantic doc yet.`).join('\n') || '- No obvious missing mirrors detected.'}
${config.l3Lite.selectedFiles.length ? '' : '\n- No selected P0 files inferred; L3-Lite will not be enforced until `l3Lite.selectedFiles` is populated.'}

## Suggested Next Steps

1. Review \`.fmp/config.json\`.
2. Review \`.fmp/mirror-matrix.yaml\`.
3. Run \`fmp-doctor\`.
4. Seed L3-Lite only for selected P0 files.
`

const planned = [
  configPath,
  matrixPath,
  statusPath,
  agentsPath,
]
if (createClaude) planned.push(claudePath)

console.log('FMP init plan:')
for (const p of planned) console.log(`- ${path.relative(root, p)}`)

if (!dryRun) {
  fs.mkdirSync(fmpDir, { recursive: true })
  writeJson(configPath, config)
  writeText(matrixPath, matrixYaml)
  writeText(statusPath, status)

  if (!fs.existsSync(agentsPath)) {
    writeText(agentsPath, agentsContent)
  }
  else {
    const current = readText(agentsPath)
    if (!current.includes('Fractal Mirror Protocol') && !current.includes('FMP:')) {
      writeText(agentsPath, `${current.trim()}\n\n---\n\n${agentsContent}`)
    }
  }

  if (createClaude && !fs.existsSync(claudePath)) {
    writeText(claudePath, claudeContent)
  }

  if (writeModuleAgents) {
    for (const pattern of classification.p0.slice(0, 8)) {
      const dir = pattern.replace(/\/\*\*$/, '')
      const target = path.join(root, dir, 'AGENTS.md')
      if (!fs.existsSync(target)) {
        writeText(target, `# ${path.basename(dir)}/

> FMP module guide. Parent: root AGENTS.md

## Role

Architecture-sensitive module detected by FMP initialization.

## Mirrors

See \`.fmp/mirror-matrix.yaml\`.

## Protocol

- Keep this file short.
- Update only when module boundaries, exported contracts, or high-risk behavior changes.
`)
      }
    }
  }
}

console.log('')
console.log('Detected:')
console.log(`- project: ${project.name}`)
console.log(`- type: ${project.type}`)
console.log(`- languages: ${project.languages.join(', ') || 'unknown'}`)
console.log(`- P0 candidates: ${classification.p0.length}`)
console.log(`- selected P0 files: ${config.l3Lite.selectedFiles.length}`)
console.log(`- mirrors: ${mirrors.length}`)
console.log('')
console.log(dryRun ? 'Dry run complete.' : 'FMP init complete.')

if (seedL3) {
  console.log('')
  console.log('Run this to seed L3-Lite anchors:')
  console.log('node .agents/skills/fmp-guardian/scripts/fmp-seed-l3.mjs --write')
}
