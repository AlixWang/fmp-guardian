import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

export const DEFAULT_IGNORES = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.wrangler',
  'target',
  '__pycache__',
  'vendor',
  '.cache',
])

export const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.kts',
  '.cs', '.php', '.rb', '.swift', '.c', '.cc', '.cpp', '.h', '.hpp',
])

export const P0_KEYWORDS = [
  'agent', 'agents', 'workflow', 'orchestrator', 'pipeline', 'state', 'machine',
  'domain', 'model', 'models', 'schema', 'schemas', 'migration', 'migrations',
  'repository', 'repositories', 'repo', 'service', 'controller', 'controllers',
  'route', 'routes', 'api', 'auth', 'permission', 'permissions', 'security',
  'billing', 'payment', 'payments', 'memory', 'retrieval', 'rag', 'vector',
  'graph', 'prompt', 'prompts', 'tool', 'tools', 'eval', 'evals', 'benchmark',
  'benchmarks', 'contract', 'contracts', 'protocol', 'event', 'events', 'queue',
  'worker', 'workers', 'webhook', 'webhooks',
]

export const P1_KEYWORDS = [
  'component', 'components', 'hook', 'hooks', 'store', 'stores', 'state',
  'utils', 'lib', 'adapter', 'adapters', 'integration', 'integrations',
  'script', 'scripts', 'page', 'pages', 'view', 'views',
]

export function exists(p) {
  return fs.existsSync(p)
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  catch {
    return fallback
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function readText(file, fallback = '') {
  try { return fs.readFileSync(file, 'utf8') }
  catch { return fallback }
}

export function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

export function walk(root, opts = {}) {
  const maxFiles = opts.maxFiles ?? 30000
  const out = []
  function visit(dir) {
    if (out.length >= maxFiles) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    }
    catch {
      return
    }
    for (const ent of entries) {
      if (out.length >= maxFiles) return
      const full = path.join(dir, ent.name)
      const rel = normalize(path.relative(root, full))
      if (!rel) continue
      if (ent.isDirectory()) {
        if (DEFAULT_IGNORES.has(ent.name)) continue
        if (ent.name.startsWith('.') && !['.github', '.agents', '.fmp'].includes(ent.name)) continue
        visit(full)
      }
      else if (ent.isFile()) {
        out.push(rel)
      }
    }
  }
  visit(root)
  return out
}

export function normalize(p) {
  return p.split(path.sep).join('/')
}

export function isCodeFile(file) {
  return CODE_EXTS.has(path.extname(file))
}

export function isGeneratedLike(file) {
  const lower = file.toLowerCase()
  return lower.includes('.gen.')
    || lower.includes('.generated.')
    || lower.endsWith('.snap')
    || lower.endsWith('pnpm-lock.yaml')
    || lower.endsWith('package-lock.json')
    || lower.endsWith('yarn.lock')
    || lower.endsWith('cargo.lock')
    || lower.includes('/dist/')
    || lower.includes('/build/')
    || lower.includes('/coverage/')
}

export function pathSegments(file) {
  return normalize(file).split('/').filter(Boolean).map(s => s.toLowerCase())
}

export function scorePath(file) {
  const segments = pathSegments(file)
  const base = path.basename(file).toLowerCase()
  let p0 = 0
  let p1 = 0
  for (const kw of P0_KEYWORDS) {
    if (segments.includes(kw) || base.includes(kw)) p0 += 3
  }
  for (const kw of P1_KEYWORDS) {
    if (segments.includes(kw) || base.includes(kw)) p1 += 1
  }
  if (isGeneratedLike(file)) return { level: 'exempt', p0, p1 }
  if (p0 >= 3) return { level: 'p0', p0, p1 }
  if (p1 >= 1) return { level: 'p1', p0, p1 }
  return { level: 'normal', p0, p1 }
}

export function inferBoundaryPattern(file) {
  const parts = normalize(file).split('/')
  if (parts.length <= 2) return file
  const lower = parts.map(p => p.toLowerCase())

  const boundaryNames = ['apps', 'packages', 'services', 'crates']
  for (const b of boundaryNames) {
    const i = lower.indexOf(b)
    if (i >= 0 && parts[i + 1]) {
      // Keep one subsystem after src/app/internal when meaningful.
      const srcI = lower.indexOf('src')
      if (srcI >= i + 2 && parts[srcI + 1]) {
        return `${parts.slice(0, srcI + 2).join('/')}/**`
      }
      return `${parts.slice(0, i + 2).join('/')}/**`
    }
  }

  const srcLike = ['src', 'app', 'lib', 'internal', 'pkg', 'cmd']
  for (const s of srcLike) {
    const i = lower.indexOf(s)
    if (i >= 0 && parts[i + 1]) {
      return `${parts.slice(0, i + 2).join('/')}/**`
    }
  }

  return `${parts.slice(0, Math.min(parts.length - 1, 3)).join('/')}/**`
}

export function unique(arr) {
  return [...new Set(arr)].filter(Boolean).sort()
}

export function detectProject(root, files) {
  const project = {
    name: path.basename(root),
    type: 'unknown',
    languages: [],
    packageManagers: [],
    frameworks: [],
    workspaces: [],
    docs: [],
    scripts: {},
  }

  const pkg = readJson(path.join(root, 'package.json'))
  if (pkg) {
    project.name = pkg.name || project.name
    project.packageManagers.push(pkg.packageManager?.split('@')[0] || 'npm')
    project.scripts = pkg.scripts || {}
    project.type = 'node'
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    for (const dep of Object.keys(deps)) {
      if (/next/i.test(dep)) project.frameworks.push('Next.js')
      if (/vite/i.test(dep)) project.frameworks.push('Vite')
      if (/react/i.test(dep)) project.frameworks.push('React')
      if (/vue/i.test(dep)) project.frameworks.push('Vue')
      if (/svelte/i.test(dep)) project.frameworks.push('Svelte')
      if (/express/i.test(dep)) project.frameworks.push('Express')
      if (/fastify/i.test(dep)) project.frameworks.push('Fastify')
      if (/nestjs/i.test(dep)) project.frameworks.push('NestJS')
    }
  }
  if (exists(path.join(root, 'pnpm-workspace.yaml'))) {
    project.packageManagers = unique([...project.packageManagers, 'pnpm'])
    project.workspaces.push('pnpm-workspace')
    project.type = project.type === 'unknown' ? 'node-monorepo' : `${project.type}-monorepo`
  }
  if (exists(path.join(root, 'yarn.lock'))) project.packageManagers.push('yarn')
  if (exists(path.join(root, 'pnpm-lock.yaml'))) project.packageManagers.push('pnpm')
  if (exists(path.join(root, 'package-lock.json'))) project.packageManagers.push('npm')

  if (exists(path.join(root, 'pyproject.toml')) || exists(path.join(root, 'requirements.txt'))) {
    project.languages.push('Python')
    if (project.type === 'unknown') project.type = 'python'
  }
  if (exists(path.join(root, 'go.mod'))) {
    project.languages.push('Go')
    if (project.type === 'unknown') project.type = 'go'
  }
  if (exists(path.join(root, 'Cargo.toml'))) {
    project.languages.push('Rust')
    if (project.type === 'unknown') project.type = 'rust'
  }
  if (exists(path.join(root, 'pom.xml')) || exists(path.join(root, 'build.gradle')) || exists(path.join(root, 'build.gradle.kts'))) {
    project.languages.push('Java/Kotlin')
    if (project.type === 'unknown') project.type = 'java'
  }

  const extCounts = new Map()
  for (const f of files) {
    const ext = path.extname(f)
    if (CODE_EXTS.has(ext)) extCounts.set(ext, (extCounts.get(ext) || 0) + 1)
  }
  const langByExt = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin',
  }
  for (const [ext, count] of [...extCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const lang = langByExt[ext]
    if (lang) project.languages.push(lang)
  }

  for (const d of ['docs', 'doc', 'spec', 'specs', 'architecture', 'adr', 'design']) {
    if (exists(path.join(root, d))) project.docs.push(d)
  }
  for (const f of ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CLAUDE.md']) {
    if (exists(path.join(root, f))) project.docs.push(f)
  }

  project.languages = unique(project.languages)
  project.packageManagers = unique(project.packageManagers)
  project.frameworks = unique(project.frameworks)
  project.docs = unique(project.docs)
  return project
}

export function detectChecks(project, root) {
  const commands = {}
  const scripts = project.scripts || {}
  for (const name of ['lint', 'typecheck', 'test', 'build', 'e2e', 'eval', 'benchmark']) {
    if (scripts[name]) commands[name] = packageRunCommand(project, name)
  }
  for (const key of Object.keys(scripts)) {
    if (/eval|benchmark|golden|replay/i.test(key) && !commands[key]) {
      commands[key] = packageRunCommand(project, key)
    }
  }

  if (exists(path.join(root, 'go.mod'))) {
    commands.test ??= 'go test ./...'
  }
  if (exists(path.join(root, 'Cargo.toml'))) {
    commands.test ??= 'cargo test'
    commands.lint ??= 'cargo clippy --all-targets --all-features'
  }
  if (exists(path.join(root, 'pyproject.toml')) || exists(path.join(root, 'requirements.txt'))) {
    commands.test ??= 'pytest'
  }
  if (exists(path.join(root, 'pom.xml'))) {
    commands.test ??= 'mvn test'
  }
  if (exists(path.join(root, 'build.gradle')) || exists(path.join(root, 'build.gradle.kts'))) {
    commands.test ??= './gradlew test'
  }
  return commands
}

export function packageRunCommand(project, script) {
  const pm = project.packageManagers.includes('pnpm') ? 'pnpm'
    : project.packageManagers.includes('yarn') ? 'yarn'
    : project.packageManagers.includes('npm') ? 'npm'
    : 'npm'
  if (pm === 'npm') return `npm run ${script}`
  return `${pm} ${script}`
}

export function classify(files) {
  const p0Files = []
  const p1Files = []
  const exemptFiles = []
  for (const f of files) {
    const score = scorePath(f)
    if (score.level === 'exempt') exemptFiles.push(f)
    else if (isCodeFile(f) && score.level === 'p0') p0Files.push(f)
    else if (isCodeFile(f) && score.level === 'p1') p1Files.push(f)
  }
  const p0 = unique(p0Files.map(inferBoundaryPattern)).slice(0, 80)
  const p1 = unique(p1Files.map(inferBoundaryPattern)).filter(p => !p0.includes(p)).slice(0, 80)
  return { p0, p1, p0Files, p1Files, exemptFiles }
}

export function detectDocs(files) {
  const docs = files.filter(f => {
    const lower = f.toLowerCase()
    return lower.endsWith('.md')
      || lower.endsWith('.mdx')
      || lower.includes('openapi')
      || lower.endsWith('.yaml')
      || lower.endsWith('.yml')
  })
  return {
    designDocs: docs.filter(f => /design|architecture|adr|rfc/i.test(f)).slice(0, 50),
    behaviorSpecs: docs.filter(f => /spec|contract|behavior|workflow|agent|eval/i.test(f)).slice(0, 50),
    apiDocs: docs.filter(f => /api|openapi|swagger/i.test(f)).slice(0, 50),
  }
}

export function buildProjectMap(project, classification) {
  const lines = []
  lines.push(`- Name: ${project.name}`)
  lines.push(`- Type: ${project.type}`)
  lines.push(`- Languages: ${project.languages.join(', ') || 'unknown'}`)
  lines.push(`- Package managers: ${project.packageManagers.join(', ') || 'unknown'}`)
  lines.push(`- Frameworks: ${project.frameworks.join(', ') || 'none detected'}`)
  if (classification.p0.length) {
    lines.push('')
    lines.push('P0 candidates:')
    for (const p of classification.p0.slice(0, 20)) lines.push(`- \`${p}\``)
  }
  return lines.join('\n')
}

export function buildCommandsBlock(commands) {
  const names = Object.keys(commands)
  if (!names.length) return 'No project check commands detected yet.'
  return names.map(k => `- \`${commands[k]}\` (${k})`).join('\n')
}

export function inferMirrorIdFromPath(file) {
  const lower = normalize(file).toLowerCase()
  if (/agent|prompt|tool|rag|retrieval|memory|vector|graph/.test(lower)) return 'agent-or-knowledge-system'
  if (/workflow|orchestrator|pipeline|state|machine/.test(lower)) return 'workflow'
  if (/api|route|controller|handler/.test(lower)) return 'api-contracts'
  if (/auth|security|permission/.test(lower)) return 'auth-security'
  if (/payment|billing/.test(lower)) return 'billing'
  if (/schema|migration|repository|db|database|persistence/.test(lower)) return 'persistence'
  if (/domain|model|contract|protocol/.test(lower)) return 'domain-contracts'
  if (/eval|benchmark|golden|replay/.test(lower)) return 'evals'
  if (/component|style|token|design/.test(lower)) return 'design-system'
  return 'general-architecture'
}

export function buildMirrorMatrix(classification, docs) {
  const groups = new Map()
  for (const p of classification.p0) {
    const id = inferMirrorIdFromPath(p)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(p)
  }

  const docHints = {
    'api-contracts': docs.apiDocs,
    'agent-or-knowledge-system': docs.behaviorSpecs.filter(d => /agent|rag|memory|retrieval|tool|prompt/i.test(d)),
    'workflow': docs.behaviorSpecs.filter(d => /workflow|pipeline|architecture/i.test(d)),
    'auth-security': docs.designDocs.filter(d => /security|auth/i.test(d)),
    'persistence': docs.designDocs.filter(d => /data|database|db|persistence|schema/i.test(d)),
    'domain-contracts': docs.behaviorSpecs.filter(d => /domain|contract|model|spec/i.test(d)),
    'evals': docs.behaviorSpecs.filter(d => /eval|benchmark|golden/i.test(d)),
    'design-system': docs.designDocs.filter(d => /design|component|ui/i.test(d)),
    'billing': docs.designDocs.filter(d => /billing|payment/i.test(d)),
    'general-architecture': docs.designDocs,
  }

  const syncWhen = {
    'api-contracts': ['route added', 'request shape changed', 'response shape changed', 'error code changed'],
    'agent-or-knowledge-system': ['agent role changed', 'tool added or removed', 'prompt output shape changed', 'retrieval/memory behavior changed'],
    'workflow': ['phase changed', 'state transition changed', 'resume/pause behavior changed', 'step key changed'],
    'auth-security': ['permission rule changed', 'token/session behavior changed', 'access boundary changed'],
    'persistence': ['schema changed', 'migration added', 'repository behavior changed', 'persistence lifecycle changed'],
    'domain-contracts': ['public type changed', 'domain invariant changed', 'event/protocol shape changed'],
    'evals': ['metric changed', 'golden case changed', 'regression scenario changed'],
    'design-system': ['token changed', 'component API changed', 'visual language changed'],
    'billing': ['pricing rule changed', 'payment lifecycle changed', 'billing state changed'],
    'general-architecture': ['module boundary changed', 'runtime responsibility changed', 'public behavior changed'],
  }

  return [...groups.entries()].map(([id, code]) => ({
    id,
    code: unique(code),
    docs: unique(docHints[id] || []),
    evals: [],
    sync_when: syncWhen[id] || syncWhen['general-architecture'],
  }))
}

export function yamlString(value, indent = 0) {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return value.map(v => {
      if (typeof v === 'object' && v) {
        return `${pad}- ${yamlObjectInlineFirst(v, indent + 2)}`
      }
      return `${pad}- ${quoteYaml(v)}`
    }).join('\n')
  }
  if (typeof value === 'object' && value) {
    return Object.entries(value).map(([k, v]) => {
      if (Array.isArray(v)) {
        if (!v.length) return `${pad}${k}: []`
        return `${pad}${k}:\n${yamlString(v, indent + 2)}`
      }
      if (typeof v === 'object' && v) {
        return `${pad}${k}:\n${yamlString(v, indent + 2)}`
      }
      return `${pad}${k}: ${quoteYaml(v)}`
    }).join('\n')
  }
  return quoteYaml(value)
}

function yamlObjectInlineFirst(obj, indent) {
  const entries = Object.entries(obj)
  if (!entries.length) return '{}'
  const [firstK, firstV] = entries[0]
  const rest = entries.slice(1)
  let out = `${firstK}: ${quoteYaml(firstV)}`
  for (const [k, v] of rest) {
    if (Array.isArray(v)) {
      out += `\n${' '.repeat(indent)}${k}:`
      if (!v.length) out += ' []'
      else out += `\n${yamlString(v, indent + 2)}`
    }
    else if (typeof v === 'object' && v) {
      out += `\n${' '.repeat(indent)}${k}:\n${yamlString(v, indent + 2)}`
    }
    else {
      out += `\n${' '.repeat(indent)}${k}: ${quoteYaml(v)}`
    }
  }
  return out
}

export function quoteYaml(v) {
  if (v == null) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') return yamlString(v)
  const s = String(v)
  if (/^[A-Za-z0-9_\-./*]+$/.test(s)) return s
  return JSON.stringify(s)
}

export function globToRegex(pattern) {
  const normalized = normalize(pattern)
  let s = ''
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        s += '.*'
        i += 1
      }
      else {
        s += '[^/]*'
      }
    }
    else {
      s += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${s}$`)
}

export function matchesAny(file, patterns) {
  return patterns.some(p => globToRegex(p).test(normalize(file)))
}

export function parseSimpleMirrors(text) {
  const mirrors = []
  let cur = null
  let section = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const id = line.match(/^-\s+id:\s+(.+)$/) || line.match(/^\s+-\s+id:\s+(.+)$/)
    if (id) {
      if (cur) mirrors.push(cur)
      cur = { id: id[1].trim(), code: [], docs: [], evals: [], sync_when: [] }
      section = null
      continue
    }
    if (!cur) continue
    const sec = line.match(/^\s*(code|docs|evals|sync_when):\s*$/)
    if (sec) {
      section = sec[1]
      continue
    }
    const item = line.match(/^\s+-\s+(.+)$/)
    if (item && section && cur[section]) cur[section].push(item[1].trim())
  }
  if (cur) mirrors.push(cur)
  return mirrors
}

export function loadMirrorMatrix(root, cfg) {
  const matrixPath = path.join(root, cfg.mirrorMatrix || '.fmp/mirror-matrix.yaml')
  return parseSimpleMirrors(readText(matrixPath))
}

export function inferMirrorIdForFile(file, mirrors = []) {
  const normalized = normalize(file)
  const matched = mirrors
    .filter(m => (m.code || []).some(pattern => globToRegex(pattern).test(normalized)))
    .sort((a, b) => {
      const aLen = Math.max(...(a.code || ['']).map(c => c.length))
      const bLen = Math.max(...(b.code || ['']).map(c => c.length))
      return bLen - aLen
    })
  return matched[0]?.id || inferMirrorIdFromPath(file)
}

export function selectedP0Score(file, root = process.cwd()) {
  const normalized = normalize(file)
  const lower = normalized.toLowerCase()
  const base = path.basename(lower)
  const ext = path.extname(lower)
  let score = 0

  if (/\/(index|main|mod)\.(ts|tsx|js|jsx|mjs|py|go|rs|java|kt|cs|php|rb|swift)$/.test(lower)) score += 16
  if (/(engine|worker|orchestrator|workflow|pipeline|state|store|schema|migration|repository|service|controller|handler|middleware|router|route|api|auth|permission|security|billing|payment|prompt|tool|eval|benchmark|golden|contract|protocol|event)/.test(lower)) score += 12
  if (/(engine|worker|compress|transform|processor|renderer|parser|validator|adapter|client)\./.test(base)) score += 14
  if (/(config|wrangler|next\.config|vite\.config|open-next\.config|package|workspace)/.test(lower)) score += 9
  if (/\/(src|lib|internal|pkg|cmd)\//.test(lower)) score += 6
  if (/\/(types|constants)\.(ts|tsx|js|jsx|mjs)$/.test(lower)) score += 5
  if (/(worker|engine|schema|middleware|router|store|repository|service|controller|handler|types)\./.test(base)) score += 8
  if (/\/index\.(ts|tsx|js|jsx|mjs)$/.test(lower)) score += 4
  if (/\.(test|spec)\./.test(lower)) score += 6

  const content = readText(path.join(root, normalized))
  const exportCount = [...content.matchAll(/\bexport\b/g)].length
  if (exportCount) score += Math.min(12, exportCount * 2)
  if (/export\s+default|module\.exports|exports\./.test(content)) score += 4
  if (/create|run|execute|dispatch|handle|process|validate|transform|compress|render|generate|parse/i.test(content)) score += 3

  if (/\/(app|pages|routes)\/.*\/(layout|page|not-found|loading|error)\.(ts|tsx|js|jsx)$/.test(lower)) score -= 8
  if (/\/routes\/.*\/index\.(ts|tsx|js|jsx)$/.test(lower)) score -= 10
  if (/\/locales\/[^/]+\/index\.(ts|tsx|js|jsx)$/.test(lower)) score -= 8
  if (/\/components\//.test(lower)) score -= 6
  if (/\/(styles?|css|theme)\//.test(lower) || ['.css', '.scss', '.sass'].includes(ext)) score -= 10

  return score
}

export function selectP0Files(root, cfg, opts = {}) {
  const limit = Number(opts.limit ?? cfg.l3Lite?.candidateLimit ?? 30)
  const files = listP0CodeFiles(root, cfg)
  return files
    .map(file => ({ file, score: selectedP0Score(file, root) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, limit)
    .map(item => item.file)
}

export function listSelectedP0Files(root, cfg, opts = {}) {
  const selected = cfg.l3Lite?.selectedFiles || []
  const files = selected.length ? selected : selectP0Files(root, cfg, opts)
  const p0Files = new Set(listP0CodeFiles(root, cfg))
  return unique(files.map(normalize))
    .filter(f => p0Files.has(f))
    .filter(f => exists(path.join(root, f)))
}

export function l3RequiresAllP0(cfg) {
  const requiredFor = cfg.l3Lite?.requiredFor || ['p0']
  return cfg.l3Lite?.enabled !== false && requiredFor.includes('p0')
}

export function l3RequiresSelectedP0(cfg) {
  const requiredFor = cfg.l3Lite?.requiredFor || ['p0']
  return cfg.l3Lite?.enabled !== false && requiredFor.includes('selected-p0')
}

export function loadConfig(root) {
  const cfgPath = path.join(root, '.fmp/config.json')
  const cfg = readJson(cfgPath)
  if (!cfg) throw new Error('Missing .fmp/config.json. Run fmp-init first.')
  return cfg
}

export function hasL3Lite(content) {
  const head = content.split(/\r?\n/).slice(0, 30).join('\n')
  return ['[FMP]:', '[MIRROR]:', '[EXPORT]:', '[CHECK]:'].every(tag => head.includes(tag))
}

export function extractL3(content) {
  const lines = content.split(/\r?\n/)
  const idx = lines.findIndex(line => line.includes('[FMP]:'))
  if (idx < 0 || idx > 30) return null
  const end = Math.min(lines.length, idx + 12)
  return lines.slice(Math.max(0, idx - 2), end).join('\n')
}

export function inferExports(file, root) {
  const content = readText(path.join(root, file))
  const ext = path.extname(file)
  const names = new Set()
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
    for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_]+)/g)) names.add(m[1])
    for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
      m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean).forEach(n => names.add(n))
    }
    if (/export\s+default/.test(content)) names.add('default')
  }
  else if (ext === '.py') {
    for (const m of content.matchAll(/^(?:def|class)\s+([A-Za-z0-9_]+)/gm)) names.add(m[1])
  }
  else if (ext === '.go') {
    for (const m of content.matchAll(/^func\s+([A-Z][A-Za-z0-9_]*)/gm)) names.add(m[1])
    for (const m of content.matchAll(/^type\s+([A-Z][A-Za-z0-9_]*)/gm)) names.add(m[1])
  }
  return [...names].slice(0, 8).join(', ') || 'module internals'
}

export function commentForFile(file, role, mirror, exportsValue, check) {
  const ext = path.extname(file)
  const body = [
    `[FMP]: ${role}`,
    `[MIRROR]: ${mirror}`,
    `[EXPORT]: ${exportsValue}`,
    `[CHECK]: ${check}`,
  ]
  if (ext === '.py') return `"""\n${body.join('\n')}\n"""\n\n`
  if (ext === '.go') return `${body.map(l => `// ${l}`).join('\n')}\n\n`
  if (ext === '.rs') return `${body.map(l => `//! ${l}`).join('\n')}\n\n`
  return `/**\n${body.map(l => ` * ${l}`).join('\n')}\n */\n\n`
}

export function roleFromPath(file, mirrorId = null) {
  const id = mirrorId || inferMirrorIdFromPath(file)
  const base = path.basename(file)
  const label = {
    'agent-or-knowledge-system': 'agent / knowledge system file',
    'workflow': 'workflow / orchestration file',
    'api-contracts': 'API contract file',
    'auth-security': 'auth / security boundary file',
    'billing': 'billing / payment behavior file',
    'persistence': 'persistence / data lifecycle file',
    'domain-contracts': 'domain contract file',
    'evals': 'eval / benchmark file',
    'design-system': 'design system file',
    'general-architecture': 'architecture-sensitive file',
  }[id] || 'architecture-sensitive file'
  return `${label}: ${base}`
}

export function checkTextFromMirrorId(id) {
  return {
    'agent-or-knowledge-system': 'agent, tool, prompt, retrieval, or memory changes require semantic mirror review',
    'workflow': 'phase, state, transition, resume, or persistence changes require mirror review',
    'api-contracts': 'request, response, route, or error shape changes require API mirror review',
    'auth-security': 'permission, token, session, or access boundary changes require security mirror review',
    'billing': 'pricing, payment, or billing state changes require mirror review',
    'persistence': 'schema, migration, repository, or lifecycle changes require data mirror review',
    'domain-contracts': 'public type, domain invariant, event, or protocol changes require mirror review',
    'evals': 'metric, fixture, golden, or regression changes require eval mirror review',
    'design-system': 'token, component API, or visual language changes require design mirror review',
  }[id] || 'public behavior or module boundary changes require mirror review'
}

export function listP0CodeFiles(root, cfg) {
  const files = walk(root)
  const p0 = cfg.paths?.p0 || []
  const exempt = cfg.paths?.exempt || []
  return files
    .filter(f => isCodeFile(f))
    .filter(f => !matchesAny(f, exempt))
    .filter(f => matchesAny(f, p0))
}

export function runCommand(command) {
  execSync(command, { stdio: 'inherit', shell: true })
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      args._.push(a)
      continue
    }
    const key = a.slice(2)
    if (key.startsWith('no-')) {
      args[key.slice(3)] = false
      continue
    }
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i++
    }
    else {
      args[key] = true
    }
  }
  return args
}

export function rootFromArgs(args) {
  return path.resolve(args.root || process.cwd())
}
