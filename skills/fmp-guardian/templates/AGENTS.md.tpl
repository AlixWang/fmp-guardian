# Project Agent Guide

This project uses FMP: Fractal Mirror Protocol.

FMP keeps code facts, semantic mirrors, agent context, and verification evidence aligned.

## Agent Entry Rules

1. Read this file before modifying code.
2. Read `.fmp/config.json` for project-specific FMP rules.
3. Read `.fmp/mirror-matrix.yaml` before changing P0 paths.
4. Keep `.fmp/architecture-snapshot.json` synchronized with architecture facts.
5. For files with L3-Lite headers, follow their `[MIRROR]` and `[CHECK]` instructions.
6. Behavior changes must update the matching semantic mirror or carry a current `.fmp/impact.yaml` waiver.
7. Do not create nested `AGENTS.md` unless the directory is a package, service, or P0 architecture boundary.

## Task Context Router

- Start with this file, `.fmp/config.json`, and `.fmp/mirror-matrix.yaml`.
- For P0 changes, read the mapped architecture mirror docs and any L3-Lite headers in touched files.
- If `docs/adr/` exists, read relevant ADRs before changing affected architecture decisions.
- Keep `.fmp/architecture-snapshot.json` synchronized as the deterministic fact baseline.
- Use dependency edges and inferred matches as detector evidence, not as separate sources of truth.
- If behavior, public contracts, state, permissions, persistence, prompts, or eval expectations change, update `FMP:SEMANTIC:*` blocks or write a current `.fmp/impact.yaml` waiver.
- Run or record the checks/evals configured in `.fmp/config.json`.

## Project Map

<!-- FMP:PROJECT_MAP_START -->
{{PROJECT_MAP}}
<!-- FMP:PROJECT_MAP_END -->

## Commands

<!-- FMP:COMMANDS_START -->
{{COMMANDS}}
<!-- FMP:COMMANDS_END -->

## FMP Policy

- FMP is a semantic consistency protocol, not a graph tool, memory system, ADR manager, or docs generator.
- Root `AGENTS.md` is the primary agent instruction file.
- `CLAUDE.md`, if present, should import or point to `AGENTS.md`.
- Only selected P0 files in `l3Lite.selectedFiles` should receive L3-Lite anchors by default.
- Generated files and trivial files should not receive L3-Lite.
- `.fmp/mirror-matrix.yaml` is the source of truth for code/document/eval synchronization.
- New capabilities should be added as detectors, validators, or routers before adding new source-of-truth files.

## Final Response Requirement

When modifying code, report:

- Code files changed
- Semantic mirrors checked or changed
- Tests/evals/checks run
- Remaining FMP debt
