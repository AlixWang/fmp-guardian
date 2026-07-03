import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CODE_EXTS,
  detectChecks,
  detectDocs,
  detectProject,
  normalize,
  readJson,
  readText,
  unique,
  walk,
  writeJson,
  writeText,
} from './fmp-utils.mjs'

const MANIFESTS = new Set([
  'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
])

const ENTRY_NAMES = /^(index|main|server|app|worker|cli|mod)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt)$/i

export function buildArchitectureSnapshot(root, cfg = {}) {
  const files = walk(root, cfg.scan || {})
  const project = detectProject(root, files)
  const boundaries = discoverBoundaries(root, files)
  const assignment = boundaryAssignment(boundaries)
  const tsFiles = files.filter(f => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(f))
  const workspacePackages = discoverWorkspacePackages(root, boundaries)
  const aliases = discoverTsAliases(root, files)
  const edges = mergeEdges([
    ...discoverTsEdges(root, tsFiles, assignment, workspacePackages, aliases),
    ...discoverManifestEdges(root, boundaries, workspacePackages),
  ])

  for (const boundary of boundaries) {
    const members = files.filter(f => assignment(f) === boundary.id)
    boundary.entrypoints = unique(members.filter(isEntrypoint).slice(0, 30))
    boundary.public_exports = unique(
      members.filter(f => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(f))
        .flatMap(f => exportedNames(readText(path.join(root, f))).map(name => `${f}#${name}`)),
    ).slice(0, 50)
    boundary.evidence = unique(boundary.evidence)
  }

  const docs = detectDocs(files)
  return stableObject({
    version: '0.2',
    project: {
      name: project.name,
      description: readJson(path.join(root, 'package.json'), {})?.description || '',
      type: project.type,
      languages: project.languages,
      frameworks: project.frameworks,
      package_managers: project.packageManagers,
    },
    boundaries,
    dependency_edges: edges,
    docs: unique([...docs.designDocs, ...docs.behaviorSpecs, ...docs.apiDocs]),
    checks: detectChecks(project, root),
    unresolved: boundaries.length === 1 && boundaries[0].root === '.'
      ? ['No package/service boundary was detected; review the root boundary.']
      : [],
  })
}

export function architectureSnapshotText(snapshot) {
  return `${JSON.stringify(stableObject(snapshot), null, 2)}\n`
}

export function architectureFingerprint(snapshot) {
  return crypto.createHash('sha256').update(architectureSnapshotText(snapshot)).digest('hex')
}

export function writeArchitectureSnapshot(file, snapshot) {
  writeJson(file, stableObject(snapshot))
}

export function syncArchitectureDocs(root, cfg, snapshot) {
  const architecture = cfg.architecture || {}
  const overview = architecture.overview || 'docs/architecture/overview.md'
  const moduleRoot = architecture.moduleRoot || 'docs/architecture/modules'
  const maxModules = architecture.maxModules ?? 12
  const overviewPath = path.join(root, overview)
  const moduleBoundaries = snapshot.boundaries
    .filter(boundary => boundary.root !== '.')
    .slice(0, maxModules)

  upsertManagedBlock(overviewPath, 'ARCHITECTURE', overviewBlock(snapshot), '# Architecture Overview')
  const modules = []
  for (const boundary of moduleBoundaries) {
    const file = normalize(path.join(moduleRoot, `${boundary.id}.md`))
    upsertManagedBlock(
      path.join(root, file),
      `MODULE:${boundary.id}`,
      moduleBlock(boundary, snapshot.dependency_edges),
      `# ${boundary.id}`,
    )
    modules.push({ id: boundary.id, file })
  }
  return { overview, modules }
}

export function staleArchitectureDocs(root, cfg, snapshot) {
  const architecture = cfg.architecture || {}
  const overview = architecture.overview || 'docs/architecture/overview.md'
  const moduleRoot = architecture.moduleRoot || 'docs/architecture/modules'
  const maxModules = architecture.maxModules ?? 12
  const targets = [{ file: overview, marker: 'ARCHITECTURE', body: overviewBlock(snapshot) }]
  for (const boundary of snapshot.boundaries.filter(item => item.root !== '.').slice(0, maxModules)) {
    targets.push({
      file: normalize(path.join(moduleRoot, `${boundary.id}.md`)),
      marker: `MODULE:${boundary.id}`,
      body: moduleBlock(boundary, snapshot.dependency_edges),
    })
  }
  return targets.filter(target => !managedBlockMatches(path.join(root, target.file), target.marker, target.body))
    .map(target => target.file)
}

export function upsertManagedBlock(file, marker, body, title) {
  const start = `<!-- FMP:${marker}_START -->`
  const end = `<!-- FMP:${marker}_END -->`
  const current = readText(file)
  const semanticMarker = `SEMANTIC:${marker}`
  const nextBody = preserveNestedBlock(current, body.trim(), semanticMarker)
  const block = `${start}\n${nextBody}\n${end}`
  if (!current) {
    writeText(file, `${title}\n\n${block}`)
    return
  }
  const startAt = current.indexOf(start)
  const endAt = current.indexOf(end)
  if (startAt >= 0 && endAt > startAt) {
    const updated = `${current.slice(0, startAt)}${block}${current.slice(endAt + end.length)}`
    writeText(file, updated)
    return
  }
  writeText(file, `${current.trimEnd()}\n\n${block}`)
}

function preserveNestedBlock(current, next, marker) {
  if (!current) return next
  const start = `<!-- FMP:${marker}_START -->`
  const end = `<!-- FMP:${marker}_END -->`
  const oldStart = current.indexOf(start)
  const oldEnd = current.indexOf(end)
  const nextStart = next.indexOf(start)
  const nextEnd = next.indexOf(end)
  if (oldStart < 0 || oldEnd <= oldStart || nextStart < 0 || nextEnd <= nextStart) return next
  const preserved = current.slice(oldStart, oldEnd + end.length)
  return `${next.slice(0, nextStart)}${preserved}${next.slice(nextEnd + end.length)}`
}

function managedBlockMatches(file, marker, body) {
  const current = readText(file)
  if (!current) return false
  const start = `<!-- FMP:${marker}_START -->`
  const end = `<!-- FMP:${marker}_END -->`
  const startAt = current.indexOf(start)
  const endAt = current.indexOf(end)
  if (startAt < 0 || endAt <= startAt) return false
  const nextBody = preserveNestedBlock(current, body.trim(), `SEMANTIC:${marker}`)
  const expected = `${start}\n${nextBody}\n${end}`
  return current.slice(startAt, endAt + end.length) === expected
}

function discoverBoundaries(root, files) {
  const found = new Map()
  const add = (dir, type, evidence) => {
    const normalized = normalize(dir || '.') || '.'
    if (!found.has(normalized)) {
      found.set(normalized, {
        id: boundaryId(normalized), root: normalized, type,
        entrypoints: [], public_exports: [], evidence: [],
      })
    }
    found.get(normalized).evidence.push(evidence)
  }

  for (const file of files) {
    if (MANIFESTS.has(path.basename(file))) {
      const dir = normalize(path.dirname(file))
      add(dir, dir === '.' ? 'project' : 'package', file)
    }
    const match = normalize(file).match(/^((?:apps|packages|services|crates)\/[^/]+)\//)
    if (match) add(match[1], match[1].startsWith('apps/') ? 'application' : 'package', `directory:${match[1]}`)
  }
  if (!found.size) add('.', 'project', 'repository-root')

  const boundaries = [...found.values()]
    .filter(candidate => candidate.root === '.' || ![...found.keys()].some(other => other !== candidate.root && other !== '.' && candidate.root.startsWith(`${other}/`) && candidate.root.split('/').length > other.split('/').length + 1))
    .sort((a, b) => a.root.localeCompare(b.root))
  return boundaries
}

function boundaryAssignment(boundaries) {
  return file => boundaries
    .filter(boundary => isInside(file, boundary.root))
    .sort((a, b) => b.root.length - a.root.length)[0]?.id || 'root'
}

function discoverTsEdges(root, files, assign, workspacePackages, aliases) {
  const known = new Set(files)
  const edges = new Map()
  for (const file of files) {
    const from = assign(file)
    const content = readText(path.join(root, file))
    for (const specifier of importSpecifiers(content)) {
      let to = null
      let evidenceTarget = specifier
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file, specifier, known)
        if (!resolved) continue
        to = assign(resolved)
        evidenceTarget = resolved
      }
      else {
        const workspace = [...workspacePackages.entries()]
          .find(([name]) => specifier === name || specifier.startsWith(`${name}/`))
        if (workspace) to = workspace[1]
        else {
          const resolved = resolveAlias(specifier, known, aliases)
          if (!resolved) continue
          to = assign(resolved)
          evidenceTarget = resolved
        }
      }
      if (from === to) continue
      const key = `${from}\0${to}`
      if (!edges.has(key)) edges.set(key, { from, to, kind: 'typescript-import', evidence: [] })
      if (edges.get(key).evidence.length < 12) edges.get(key).evidence.push(`${file} -> ${evidenceTarget}`)
    }
  }
  return [...edges.values()].map(edge => ({ ...edge, evidence: unique(edge.evidence) }))
    .sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`))
}

function discoverWorkspacePackages(root, boundaries) {
  const packages = new Map()
  for (const boundary of boundaries) {
    const pkg = readJson(path.join(root, boundary.root, 'package.json'))
    if (pkg?.name) packages.set(pkg.name, boundary.id)
  }
  return packages
}

function discoverManifestEdges(root, boundaries, workspacePackages) {
  const edges = []
  for (const boundary of boundaries) {
    const pkg = readJson(path.join(root, boundary.root, 'package.json'))
    const dependencies = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}), ...(pkg?.peerDependencies || {}) }
    for (const name of Object.keys(dependencies)) {
      const to = workspacePackages.get(name)
      if (!to || to === boundary.id) continue
      edges.push({ from: boundary.id, to, kind: 'workspace-dependency', evidence: [`${boundary.root}/package.json -> ${name}`] })
    }
  }
  return edges
}

function discoverTsAliases(root, files) {
  const aliases = []
  for (const file of files.filter(file => /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(file))) {
    const config = readJsonc(path.join(root, file))
    const compiler = config?.compilerOptions || {}
    const base = normalize(path.join(path.dirname(file), compiler.baseUrl || '.'))
    for (const [pattern, targets] of Object.entries(compiler.paths || {})) {
      for (const target of targets || []) aliases.push({ pattern, target: normalize(path.join(base, target)) })
    }
  }
  return aliases
}

function resolveAlias(specifier, known, aliases) {
  for (const alias of aliases) {
    const star = alias.pattern.indexOf('*')
    if (star < 0 && specifier !== alias.pattern) continue
    if (star >= 0 && (!specifier.startsWith(alias.pattern.slice(0, star)) || !specifier.endsWith(alias.pattern.slice(star + 1)))) continue
    const captured = star < 0 ? '' : specifier.slice(alias.pattern.slice(0, star).length, specifier.length - alias.pattern.slice(star + 1).length)
    const base = alias.target.replace('*', captured)
    const resolved = resolveKnown(base, known)
    if (resolved) return resolved
  }
  return null
}

function importSpecifiers(content) {
  const out = []
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) for (const match of content.matchAll(pattern)) out.push(match[1])
  return unique(out)
}

function resolveRelative(file, specifier, known) {
  const base = normalize(path.join(path.dirname(file), specifier))
  return resolveKnown(base, known)
}

function resolveKnown(base, known) {
  const candidates = [base]
  if (/\.(?:js|mjs|cjs)$/.test(base)) {
    candidates.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'))
    candidates.push(base.replace(/\.mjs$/, '.mts'), base.replace(/\.cjs$/, '.cts'))
  }
  for (const ext of CODE_EXTS) candidates.push(`${base}${ext}`)
  for (const ext of CODE_EXTS) candidates.push(`${base}/index${ext}`)
  return candidates.find(candidate => known.has(candidate)) || null
}

function mergeEdges(edges) {
  const merged = new Map()
  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}\0${edge.kind}`
    if (!merged.has(key)) merged.set(key, { ...edge, evidence: [] })
    merged.get(key).evidence.push(...edge.evidence)
  }
  return [...merged.values()].map(edge => ({ ...edge, evidence: unique(edge.evidence).slice(0, 12) }))
    .sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`))
}

function readJsonc(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(text)
  }
  catch { return null }
}

function exportedNames(content) {
  const names = []
  for (const match of content.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) names.push(match[1])
  for (const match of content.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    names.push(...match[1].split(',').map(item => item.trim().split(/\s+as\s+/).pop()).filter(Boolean))
  }
  return unique(names)
}

function isEntrypoint(file) {
  const base = path.basename(file)
  return ENTRY_NAMES.test(base) || /(?:^|\/)(?:bin|cmd|routes?)\//.test(file)
}

function isInside(file, root) {
  return root === '.' || file === root || file.startsWith(`${root}/`)
}

function boundaryId(root) {
  if (root === '.') return 'root'
  return root.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function overviewBlock(snapshot) {
  const boundaries = snapshot.boundaries.map(boundary => `| ${boundary.id} | \`${boundary.root}\` | ${boundary.type} | ${boundary.entrypoints.slice(0, 3).map(v => `\`${v}\``).join(', ') || 'Review required'} |`).join('\n')
  const edges = snapshot.dependency_edges.map(edge => `- \`${edge.from}\` → \`${edge.to}\` (${edge.kind})`).join('\n') || '- No cross-boundary dependency was detected.'
  const unresolved = snapshot.unresolved.map(item => `- ${item}`).join('\n') || '- None from deterministic discovery.'
  return `> Generated from repository evidence. Deterministic facts are refreshed by \`fmp-scan\`; agent-reviewed semantics are preserved separately.\n\n## System Facts\n\n- Project: ${snapshot.project.name}\n- Type: ${snapshot.project.type}\n- Languages: ${snapshot.project.languages.join(', ') || 'unknown'}\n- Frameworks: ${snapshot.project.frameworks.join(', ') || 'none detected'}\n\n## Architecture Boundaries\n\n| Boundary | Root | Type | Entrypoints |\n| --- | --- | --- | --- |\n${boundaries}\n\n## Cross-boundary Dependencies\n\n${edges}\n\n## Agent-Reviewed Semantics\n\n<!-- FMP:SEMANTIC:ARCHITECTURE_START -->\n- FMP:SEMANTIC_REVIEW_PENDING — verify system purpose, runtime/data flows, external systems, and architecture constraints from source evidence.\n<!-- FMP:SEMANTIC:ARCHITECTURE_END -->\n\n## Open Questions\n\n${unresolved}`
}

function moduleBlock(boundary, edges) {
  const inbound = edges.filter(edge => edge.to === boundary.id).map(edge => `\`${edge.from}\``)
  const outbound = edges.filter(edge => edge.from === boundary.id).map(edge => `\`${edge.to}\``)
  return `> Deterministic module baseline. Agent-reviewed semantics must remain supported by code evidence.\n\n## Entrypoints and Public Contracts\n\n${list(boundary.entrypoints)}\n\nPublic exports:\n\n${list(boundary.public_exports)}\n\n## Dependencies\n\n- Inbound: ${inbound.join(', ') || 'none detected'}\n- Outbound: ${outbound.join(', ') || 'none detected'}\n\n## Agent-Reviewed Semantics\n\n<!-- FMP:SEMANTIC:MODULE:${boundary.id}_START -->\n- FMP:SEMANTIC_REVIEW_PENDING — verify responsibility, runtime behavior, state/data ownership, and external interactions.\n<!-- FMP:SEMANTIC:MODULE:${boundary.id}_END -->\n\n## Change Triggers\n\n- Update this page when responsibilities, entrypoints, public contracts, state ownership, or cross-boundary dependencies change.`
}

function list(values) {
  return values.length ? values.map(value => `- \`${value}\``).join('\n') : '- None detected; review required.'
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableObject(value[key])]))
}
