---
name: fmp-guardian
description: Generic Fractal Mirror Protocol bootstrap and maintenance skill. Use in any repository to initialize project-local AGENTS.md, .fmp config, mirror matrix, L3-Lite anchors, sync plans, and drift/eval checks without hardcoding project-specific paths.
user-invokable: true
---

# FMP Guardian

You are a generic Fractal Mirror Protocol guardian.

Your job is not to apply a fixed project convention.  
Your job is to discover the current repository, infer its architecture boundaries, and generate project-local FMP rules.

## Core Principle

The skill is universal.  
The project rules are local.

Never hardcode paths from another project.
Never assume `src/server`, `apps/web`, `spec`, or `evals` exist.
Always discover first.
Ignore common tool, agent, editor, generated, and cache directories during broad
project scans. Installed skills and local agent metadata are not project semantic
mirrors by default.

## What FMP Means

FMP = Fractal Mirror Protocol.

It keeps code facts and semantic mirrors aligned through:

- sparse `AGENTS.md`
- project-local `.fmp/config.json`
- project-local `.fmp/mirror-matrix.yaml`
- deterministic `.fmp/architecture-snapshot.json`
- FMP-managed architecture overview and sparse module pages
- short L3-Lite file anchors for files listed in `l3Lite.selectedFiles`
- drift checks
- tests/evals/check gates

FMP is not "write more docs".  
FMP is "give code agents a low-noise semantic map".

## Modes

### Mode: init

Use when the user asks to initialize FMP in a project.

Steps:

1. Discover project shape:
   - language markers
   - package manager
   - workspace layout
   - application/package/service boundaries
   - existing docs
   - existing tests/evals/checks
   - existing agent instruction files

2. Classify paths:
   - P0: high-risk semantic drift paths
   - P1: ordinary business paths
   - P2: exempt/generated/trivial paths

3. Generate project-local artifacts:
   - `AGENTS.md`
   - `.fmp/config.json`
   - `.fmp/mirror-matrix.yaml`
   - `.fmp/status.md`
   - `.fmp/architecture-snapshot.json`
   - an architecture overview and sparse module pages
   - optional `CLAUDE.md` compatibility shim

4. Seed sparse module docs only for real boundaries:
   - monorepo package
   - backend service
   - frontend app
   - core domain
   - agent/workflow/retrieval/persistence subsystem

5. Read the architecture snapshot and relevant source evidence. Complete the nested
   `FMP:SEMANTIC:*` blocks with responsibilities, runtime flows, state/data ownership,
   external systems, and constraints only when those claims are supported by evidence.
   Remove every `FMP:SEMANTIC_REVIEW_PENDING` marker. Do not edit deterministic facts.

6. Generate `l3Lite.selectedFiles` for high-signal P0 files. Add L3-Lite only when explicitly seeding.

7. Report:
   - detected project type
   - generated files
   - P0/P1/P2 classification
   - mirror matrix summary
   - remaining FMP debt

### Mode: sync-plan

Use when the user proposes or performs design/architecture changes.

Steps:

1. Summarize the design decision.
2. Resolve the Git comparison base and inspect changed files.
3. Map affected code areas using `.fmp/mirror-matrix.yaml`.
4. Refresh the architecture snapshot and inspect structural deltas.
5. Update affected `FMP:SEMANTIC:*` blocks. Preserve deterministic facts and human prose.
6. If no mapped `FMP:SEMANTIC:*` block needs a change, write a precise
   `no-doc-impact` reason to the current `.fmp/impact.yaml`; never reuse a stale
   waiver.
7. Identify and run relevant checks/evals.

### Mode: check

Use before finishing a code change.

Steps:

1. Read `.fmp/config.json`.
2. Read `.fmp/mirror-matrix.yaml`.
3. Check changed P0 files.
4. Verify the architecture snapshot is current.
5. Verify L3-Lite anchors for selected P0 files.
6. Require each affected mirror to have a changed mapped `FMP:SEMANTIC:*` block
   or a fingerprint-matched waiver.
7. Verify stale mirror links and missing architecture docs.
8. Verify tests/evals/checks were run or explain why not.
9. Return PASS / WARN / FAIL.

### Mode: doctor

Use to assess FMP health.

Steps:

1. Measure root `AGENTS.md` health.
2. Measure nested `AGENTS.md` count and relevance.
3. Measure P0 L3-Lite coverage.
4. Detect stale mirror links.
5. Detect missing docs for high-risk modules.
6. Detect stale architecture snapshots and unmapped boundaries.
7. Recommend minimal repairs.

## P0 Heuristics

Classify a path as P0 if it contains or controls:

- public API
- exported contracts
- domain model
- state machine
- workflow/orchestrator
- persistence/schema/migration
- auth/security/permission
- payment/billing
- message/event protocol
- agent/prompt/tool/RAG/memory
- eval/benchmark/golden tests
- deployment/runtime config

## Exempt Heuristics

Do not add L3-Lite to:

- generated files
- lock files
- snapshots
- build outputs
- vendored dependencies
- static assets
- simple style files
- trivial configs

## L3-Lite

Use this format only:

```text
[FMP]: short file role
[MIRROR]: semantic mirror path or mirror id
[EXPORT]: main exports
[CHECK]: what changes require sync
```

Keep it short.  
Do not duplicate imports.  
Do not explain implementation.  
Do not create long file headers.

`selected-p0` means only files listed in `.fmp/config.json` at `l3Lite.selectedFiles`
require L3-Lite anchors. P0 path patterns still define the broader high-risk surface,
but they are not all required to carry file headers unless `requiredFor` includes `p0`.

## Preferred Commands

When available in the project:

```bash
node .agents/skills/fmp-guardian/scripts/fmp-init.mjs
node .agents/skills/fmp-guardian/scripts/fmp-scan.mjs --write
node .agents/skills/fmp-guardian/scripts/fmp-doctor.mjs
node .agents/skills/fmp-guardian/scripts/fmp-check.mjs
node .agents/skills/fmp-guardian/scripts/fmp-sync-plan.mjs --write-impact "design decision"
node .agents/skills/fmp-guardian/scripts/fmp-seed-l3.mjs --write
node .agents/skills/fmp-guardian/scripts/fmp-eval.mjs
```

## Final Response

Always report:

- project-local FMP files touched
- code files touched
- semantic mirrors touched
- checks/evals run
- FMP debt remaining
