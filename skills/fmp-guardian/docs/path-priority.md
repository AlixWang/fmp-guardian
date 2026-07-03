# Path Priority Heuristics

## P0

P0 paths can cause semantic drift and should have stronger FMP constraints.

Signals:

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

## P1

P1 paths are meaningful but not always high-risk.

Signals:

- business services
- complex UI containers
- state stores
- non-trivial scripts
- integration adapters

## P2 / Exempt

Signals:

- generated files
- lock files
- snapshots
- build output
- vendored dependencies
- static assets
- simple style files
- trivial configs
