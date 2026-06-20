import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('initialization builds a stable architecture baseline and preserves human prose', () => {
  const root = fixture()
  run('scripts/fmp-init.mjs', ['--root', root])

  const config = json(root, '.fmp/config.json')
  const snapshot = json(root, '.fmp/architecture-snapshot.json')
  assert.equal(config.version, '0.2')
  assert.ok(snapshot.boundaries.some(item => item.root === 'apps/api'))
  assert.ok(snapshot.boundaries.some(item => item.root === 'packages/core'))
  assert.ok(snapshot.dependency_edges.some(edge => edge.from === 'apps-api' && edge.to === 'packages-core' && edge.kind === 'typescript-import'))
  assert.ok(snapshot.dependency_edges.some(edge => edge.from === 'apps-api' && edge.to === 'packages-core' && edge.kind === 'workspace-dependency'))

  const overview = path.join(root, 'docs/architecture/overview.md')
  assert.match(fs.readFileSync(overview, 'utf8'), /FMP:ARCHITECTURE_START/)
  completeSemanticDocs(root)
  fs.appendFileSync(overview, '\nHuman-maintained rationale.\n')
  run('scripts/fmp-init.mjs', ['--root', root])
  assert.match(fs.readFileSync(overview, 'utf8'), /Human-maintained rationale/)
  assert.doesNotMatch(fs.readFileSync(overview, 'utf8'), /SEMANTIC_REVIEW_PENDING/)
  run('scripts/fmp-scan.mjs', ['--root', root, '--check'])
  fs.writeFileSync(overview, fs.readFileSync(overview, 'utf8').replace('Project: fixture', 'Project: stale-value'))
  const stale = invoke('scripts/fmp-scan.mjs', ['--root', root, '--check'])
  assert.notEqual(stale.status, 0)
  assert.match(stale.stdout + stale.stderr, /managed facts are stale/)
})

test('strict check requires a mapped doc update for changed P0 code', () => {
  const root = fixture()
  run('scripts/fmp-init.mjs', ['--root', root])
  completeSemanticDocs(root)
  run('scripts/fmp-seed-l3.mjs', ['--root', root, '--write'])
  commit(root, 'baseline')

  const serviceFile = path.join(root, 'packages/core/src/service.ts')
  fs.writeFileSync(serviceFile, fs.readFileSync(serviceFile, 'utf8').replace('service = true', 'service = false'))
  run('scripts/fmp-scan.mjs', ['--root', root, '--write'])
  const failed = invoke('scripts/fmp-check.mjs', ['--root', root, '--strict'])
  assert.notEqual(failed.status, 0)
  assert.match(failed.stdout + failed.stderr, /no mapped doc changed/)

  fs.appendFileSync(path.join(root, 'docs/architecture/modules/packages-core.md'), '\nUpdated architecture behavior.\n')
  const passed = invoke('scripts/fmp-check.mjs', ['--root', root, '--strict'])
  assert.equal(passed.status, 0, passed.stdout + passed.stderr)
})

test('a current no-doc-impact waiver satisfies the gate and stale fingerprints fail', () => {
  const root = fixture()
  run('scripts/fmp-init.mjs', ['--root', root])
  completeSemanticDocs(root)
  run('scripts/fmp-seed-l3.mjs', ['--root', root, '--write'])
  commit(root, 'baseline')

  const code = path.join(root, 'packages/core/src/service.ts')
  fs.writeFileSync(code, fs.readFileSync(code, 'utf8').replace('service = true', 'service = false'))
  run('scripts/fmp-scan.mjs', ['--root', root, '--write'])
  run('scripts/fmp-sync-plan.mjs', ['--root', root, '--write-impact', 'internal refactor'])
  const impact = path.join(root, '.fmp/impact.yaml')
  fs.writeFileSync(impact, fs.readFileSync(impact, 'utf8').replace(
    'waivers: []',
    'waivers:\n  - mirror: general-architecture\n    disposition: no-doc-impact\n    reason: "Internal implementation only"',
  ))
  let result = invoke('scripts/fmp-check.mjs', ['--root', root, '--strict'])
  assert.equal(result.status, 0, result.stdout + result.stderr)

  fs.appendFileSync(code, '\n// another implementation-only edit\n')
  result = invoke('scripts/fmp-check.mjs', ['--root', root, '--strict'])
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /no current no-doc-impact waiver/)
})

test('strict CI refuses to guess a base reference', () => {
  const root = fixture()
  run('scripts/fmp-init.mjs', ['--root', root])
  commit(root, 'baseline')
  const result = invoke('scripts/fmp-check.mjs', ['--root', root, '--strict'], { CI: 'true' })
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /require --base/)
})

test('strict mode rejects an unreviewed semantic baseline', () => {
  const root = fixture()
  run('scripts/fmp-init.mjs', ['--root', root])
  run('scripts/fmp-seed-l3.mjs', ['--root', root, '--write'])
  const result = invoke('scripts/fmp-check.mjs', ['--root', root, '--strict'])
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /semantic review is incomplete/i)
})

test('v0.1 upgrade adds defaults without replacing a manual mirror matrix', () => {
  const root = fixture()
  run('scripts/fmp-init.mjs', ['--root', root])
  const configPath = path.join(root, '.fmp/config.json')
  const config = json(root, '.fmp/config.json')
  config.version = '0.1'
  delete config.architecture
  delete config.changeDetection
  delete config.enforcement
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  const matrixPath = path.join(root, '.fmp/mirror-matrix.yaml')
  const manualMatrix = `${fs.readFileSync(matrixPath, 'utf8')}\n# manual-matrix-note\n`
  fs.writeFileSync(matrixPath, manualMatrix)

  run('scripts/fmp-init.mjs', ['--root', root, '--upgrade'])
  const upgraded = json(root, '.fmp/config.json')
  assert.equal(upgraded.version, '0.2')
  assert.equal(upgraded.enforcement.docSync, 'required-or-waiver')
  assert.equal(fs.readFileSync(matrixPath, 'utf8'), manualMatrix)
})

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-v02-'))
  write(root, 'package.json', JSON.stringify({
    name: 'fixture', private: true, workspaces: ['apps/*', 'packages/*'],
    scripts: { test: 'node --test' },
  }, null, 2))
  write(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@core/*': ['packages/core/src/*'] } } }))
  write(root, 'apps/api/package.json', JSON.stringify({ name: '@fixture/api', dependencies: { '@fixture/core': 'workspace:*' } }))
  write(root, 'apps/api/src/main.ts', "import { service } from '@core/service'\nexport const api = service\n")
  write(root, 'packages/core/package.json', JSON.stringify({ name: '@fixture/core' }))
  write(root, 'packages/core/src/service.ts', 'export const service = true\n')
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'fmp@example.test'])
  git(root, ['config', 'user.name', 'FMP Test'])
  return root
}

function commit(root, message) {
  git(root, ['add', '.'])
  git(root, ['commit', '-q', '-m', message])
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function run(script, args) {
  const result = invoke(script, args)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return result.stdout
}

function invoke(script, args, extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(skillRoot, script), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
}

function write(root, relative, content) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function json(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
}

function completeSemanticDocs(root) {
  const architectureRoot = path.join(root, 'docs/architecture')
  for (const file of walkFiles(architectureRoot)) {
    if (!file.endsWith('.md')) continue
    const content = fs.readFileSync(file, 'utf8')
      .replace(/- FMP:SEMANTIC_REVIEW_PENDING[^\n]*/g, '- Reviewed from fixture source evidence.')
    fs.writeFileSync(file, content)
  }
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(dir, entry.name)
    return entry.isDirectory() ? walkFiles(target) : [target]
  })
}
