import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { globToRegex, normalize, quoteYaml, readText, unique, writeText } from './fmp-utils.mjs'

export function resolveChangeSet(root, args = {}, { strict = false } = {}) {
  const explicitBase = args.base || process.env.FMP_BASE_REF
  if (strict && process.env.CI === 'true' && !explicitBase) {
    throw new Error('Strict CI checks require --base <ref> or FMP_BASE_REF.')
  }
  if (explicitBase) {
    const baseCommit = git(root, ['merge-base', String(explicitBase), 'HEAD']).trim()
    const changed = git(root, ['diff', '--name-only', '--diff-filter=ACMRD', `${baseCommit}...HEAD`]).split(/\r?\n/).filter(Boolean)
    return { baseCommit, files: unique(changed.map(normalize)), mode: 'branch' }
  }
  const changed = git(root, ['diff', '--name-only', '--diff-filter=ACMRD', 'HEAD']).split(/\r?\n/).filter(Boolean)
  const staged = git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMRD', 'HEAD']).split(/\r?\n/).filter(Boolean)
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean)
  const baseCommit = git(root, ['rev-parse', 'HEAD']).trim()
  return { baseCommit, files: unique([...changed, ...staged, ...untracked].map(normalize)), mode: 'worktree' }
}

export function affectedMirrors(files, mirrors) {
  return mirrors.filter(mirror => files.some(file => (mirror.code || []).some(pattern => globToRegex(pattern).test(file))))
}

export function codeFingerprint(root, baseCommit, files) {
  const hash = crypto.createHash('sha256')
  hash.update(`${baseCommit}\n`)
  for (const file of unique(files)) {
    hash.update(`${file}\0`)
    const full = path.join(root, file)
    hash.update(fs.existsSync(full) ? fs.readFileSync(full) : '<deleted>')
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function valueFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableObject(value))).digest('hex')
}

export function readGitFile(root, ref, file) {
  if (!ref || ref === 'manual') return null
  try {
    return execFileSync('git', ['show', `${ref}:${normalize(file)}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }
  catch {
    return null
  }
}

export function extractFmpManagedBlocks(text) {
  return extractFmpBlocks(text, /^.+$/)
}

export function extractFmpSemanticBlocks(text) {
  const blocks = []
  const pattern = /<!-- FMP:(SEMANTIC:[A-Za-z0-9:_-]+)_START -->([\s\S]*?)<!-- FMP:\1_END -->/g
  for (const match of text.matchAll(pattern)) {
    blocks.push({ marker: match[1], body: match[2].trim() })
  }
  return blocks
}

function extractFmpBlocks(text, markerPattern) {
  const blocks = []
  const pattern = /<!-- FMP:([A-Za-z0-9:_-]+)_START -->([\s\S]*?)<!-- FMP:\1_END -->/g
  for (const match of text.matchAll(pattern)) {
    if (!markerPattern.test(match[1])) continue
    blocks.push({ marker: match[1], body: match[2].trim() })
  }
  return blocks
}

export function fmpManagedBlocksChanged(root, baseCommit, file) {
  const before = readGitFile(root, baseCommit, file) ?? ''
  const current = readText(path.join(root, file))
  const beforeBlocks = extractFmpManagedBlocks(before)
  const currentBlocks = extractFmpManagedBlocks(current)
  if (!beforeBlocks.length && !currentBlocks.length) return before !== current
  return JSON.stringify(beforeBlocks) !== JSON.stringify(currentBlocks)
}

export function fmpSemanticBlocksChanged(root, baseCommit, file) {
  const before = readGitFile(root, baseCommit, file) ?? ''
  const current = readText(path.join(root, file))
  const beforeBlocks = extractFmpSemanticBlocks(before)
  const currentBlocks = extractFmpSemanticBlocks(current)
  if (!beforeBlocks.length && !currentBlocks.length) return before !== current
  return JSON.stringify(beforeBlocks) !== JSON.stringify(currentBlocks)
}

export function writeImpactFile(file, data) {
  const lines = [
    'version: 0.2',
    `base_commit: ${quoteYaml(data.baseCommit)}`,
    `code_fingerprint: ${quoteYaml(data.codeFingerprint)}`,
    'affected_mirrors:',
  ]
  if (!data.mirrors.length) lines.push('  []')
  else for (const mirror of data.mirrors) {
    lines.push(`  - id: ${quoteYaml(mirror.id)}`)
    lines.push('    changed_files:')
    for (const changed of mirror.changedFiles) lines.push(`      - ${quoteYaml(changed)}`)
  }
  lines.push('waivers: []')
  lines.push('')
  lines.push('# To waive a mirror whose docs did not change, replace `waivers: []` with:')
  lines.push('# waivers:')
  lines.push('#   - mirror: mirror-id')
  lines.push('#     disposition: no-doc-impact')
  lines.push('#     reason: "Why architecture or public behavior did not change"')
  writeText(file, lines.join('\n'))
}

export function parseImpactFile(file) {
  const text = readText(file)
  if (!text) return null
  const baseCommit = scalar(text, 'base_commit')
  const codeFingerprint = scalar(text, 'code_fingerprint')
  const waivers = []
  let section = ''
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    if (/^waivers:\s*$/.test(raw)) { section = 'waivers'; continue }
    if (/^[A-Za-z_]+:/.test(raw) && !/^\s/.test(raw)) { section = ''; continue }
    if (section !== 'waivers' || /^\s*#/.test(raw)) continue
    const start = raw.match(/^\s+-\s+mirror:\s*(.+)$/)
    if (start) {
      if (current) waivers.push(current)
      current = { mirror: unquote(start[1]), disposition: '', reason: '' }
      continue
    }
    const field = raw.match(/^\s+(disposition|reason):\s*(.*)$/)
    if (current && field) current[field[1]] = unquote(field[2])
  }
  if (current) waivers.push(current)
  return { baseCommit, codeFingerprint, waivers }
}

function scalar(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return match ? unquote(match[1]) : ''
}

function unquote(value) {
  const text = value.trim()
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text) }
    catch { return text.slice(1, -1) }
  }
  return text.replace(/^'|'$/g, '')
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }
  catch (error) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${error.stderr?.trim() || error.message}`)
  }
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableObject(value[key])]))
}
