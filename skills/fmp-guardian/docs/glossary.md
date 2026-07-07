# FMP Glossary

## Core Terms

- FMP: Fractal Mirror Protocol, a semantic consistency protocol for
  agent-maintained codebases.
- P0 path: code or config whose changes can create semantic drift.
- semantic mirror: reviewed architecture documentation that explains what code
  means, owns, exposes, or guarantees.
- mirror matrix: `.fmp/mirror-matrix.yaml`, the binding between code paths,
  semantic mirrors, and eval/check expectations.
- architecture snapshot: `.fmp/architecture-snapshot.json`, deterministic facts
  discovered from the repository.
- L3-Lite: a short file anchor for selected P0 files; it points agents to the
  relevant mirror and sync trigger.
- no-doc-impact waiver: branch-local `.fmp/impact.yaml` evidence that a P0
  change does not require semantic mirror edits.
- check evidence: `.fmp/check-evidence.json`, current results from configured
  checks or evals.

## Extension Roles

- detector: finds possibly affected mirrors or risk signals.
- validator: checks conformance between code, mirrors, ADRs, agent instructions,
  snapshots, and evidence.
- router: recommends the minimum context an agent should read for a task.

## Boundary Terms

- source of truth: a file FMP treats as authoritative protocol state.
- derived evidence: useful facts generated from source, such as dependency
  edges or inferred affected mirrors.
- conformance: whether code facts, semantic mirrors, agent context, and evidence
  still agree.
