# Fractal Mirror Protocol

FMP is a low-noise semantic synchronization protocol for code agents.

Broad project scans exclude local tool and agent metadata directories by default,
including `.agents`, `.claude`, `.codex`, `.cursor`, `.fmp`, `.kiro`, editor
folders, dependency folders, and build/cache outputs. Root `AGENTS.md` and
explicit `.fmp/*` files are still read when commands need them.

## Principles

1. The skill is generic; project rules are local.
2. Sparse maps beat exhaustive documents.
3. Mirror matrix beats vague "keep docs updated" rules.
4. L3-Lite is a file anchor, not a file manual.
5. CI/checks should judge mechanical drift.
6. Eval is part of the semantic mirror.

## Levels

- L1: root `AGENTS.md`
- L2: sparse module `AGENTS.md` only for real architecture boundaries
- L3: short L3-Lite anchors for selected P0 files
- Mirror: `.fmp/mirror-matrix.yaml`
- Fact baseline: `.fmp/architecture-snapshot.json`
- Semantic docs: FMP-managed blocks in the architecture overview and sparse module pages
- Change evidence: `.fmp/impact.yaml`
- Gate: `fmp-check`, project tests, and evals

## Architecture Evolution Gate

The scanner records deterministic architecture facts without timestamps. A stale
snapshot means repository boundaries, entrypoints, public exports, dependencies,
docs, or checks changed without refreshing the baseline.

For each changed P0 mirror, the gate accepts one of two outcomes:

1. At least one mapped semantic document changed.
2. `.fmp/impact.yaml` contains a non-empty `no-doc-impact` reason whose base commit
   and code fingerprint match the current change set.

The impact record is branch-local evidence, not a permanent exemption. Any further
P0 edit invalidates its fingerprint. Strict CI checks require an explicit base ref.

Outer FMP document blocks contain deterministic scanner facts. Nested
`FMP:SEMANTIC:*` blocks are agent-reviewed and survive scanner refreshes. Strict mode
rejects `FMP:SEMANTIC_REVIEW_PENDING`; content outside the outer markers remains
human-owned.

## L3-Lite

```ts
/**
 * [FMP]: short file role
 * [MIRROR]: docs/architecture.md or .fmp/mirror-matrix.yaml#mirror-id
 * [EXPORT]: main exports
 * [CHECK]: sync trigger
 */
```

L3-Lite must not explain implementation details.

When `.fmp/config.json` uses `l3Lite.requiredFor: ["selected-p0"]`, only files in
`l3Lite.selectedFiles` require these anchors. P0 patterns remain the broad
high-risk surface; selected P0 is the smaller set of files worth pinning with
headers.
