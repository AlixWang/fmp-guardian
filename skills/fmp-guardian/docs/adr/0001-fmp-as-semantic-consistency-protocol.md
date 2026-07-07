# ADR 0001: Keep FMP as a Semantic Consistency Protocol

Status: accepted

## Context

FMP overlaps with several adjacent tool categories: dependency graph analyzers,
agent memory scaffolds, ADR governance systems, project plan drift reports, and
test/eval runners. Copying their feature lists directly would make FMP broad but
unclear.

The distinctive FMP value is the closed loop between high-risk code paths,
semantic mirrors, agent instructions, and verification evidence.

## Decision

FMP remains a semantic consistency protocol for agent-maintained codebases.

The protocol centers on this invariant:

```text
P0 code path
  -> mirror matrix
  -> architecture semantic mirror
  -> semantic block or current waiver
  -> check/eval evidence
  -> strict gate
```

Adjacent capabilities may be added only when they fit one of these roles:

- detector: finds possibly affected mirrors
- validator: checks mirror, ADR, AGENTS, snapshot, or evidence conformance
- router: recommends the minimum context an agent should read

FMP must not introduce new default authoritative stores such as `graph.db`,
`memory/`, `decisions.jsonl`, `contracts.yaml`, or `PLAN.md`.

## Consequences

- Dependency graphs are useful for affected-mirror detection and boundary
  validation, but they remain derived evidence.
- Agent memory and router ideas should reduce context noise, not create a
  parallel memory system.
- ADRs remain the decision source of truth when a project has them; ADR-aware
  validators should check conformance through mirrors and evidence.
- Strict gates should continue to rely on deterministic evidence: changed P0
  files, mirror mappings, semantic block diffs, current waivers, and current
  check/eval evidence.
