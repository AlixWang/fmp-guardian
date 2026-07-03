# Project Agent Guide

This project uses FMP: Fractal Mirror Protocol.

FMP keeps code facts and semantic mirrors aligned.

## Agent Entry Rules

1. Read this file before modifying code.
2. Read `.fmp/config.json` for project-specific FMP rules.
3. Read `.fmp/mirror-matrix.yaml` before changing P0 paths.
4. Keep `.fmp/architecture-snapshot.json` synchronized with architecture facts.
5. For files with L3-Lite headers, follow their `[MIRROR]` and `[CHECK]` instructions.
6. Behavior changes must update the matching semantic mirror or carry a current `.fmp/impact.yaml` waiver.
7. Do not create nested `AGENTS.md` unless the directory is a package, service, or P0 architecture boundary.

## Project Map

<!-- FMP:PROJECT_MAP_START -->
{{PROJECT_MAP}}
<!-- FMP:PROJECT_MAP_END -->

## Commands

<!-- FMP:COMMANDS_START -->
{{COMMANDS}}
<!-- FMP:COMMANDS_END -->

## FMP Policy

- Root `AGENTS.md` is the primary agent instruction file.
- `CLAUDE.md`, if present, should import or point to `AGENTS.md`.
- Only selected P0 files in `l3Lite.selectedFiles` should receive L3-Lite anchors by default.
- Generated files and trivial files should not receive L3-Lite.
- `.fmp/mirror-matrix.yaml` is the source of truth for code/document/eval synchronization.

## Final Response Requirement

When modifying code, report:

- Code files changed
- Semantic mirrors checked or changed
- Tests/evals/checks run
- Remaining FMP debt
