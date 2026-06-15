# FMP Examples

## Backend API

```yaml
- id: api-contracts
  code:
    - src/routes/**
    - src/controllers/**
  docs:
    - docs/api.md
    - openapi.yaml
  sync_when:
    - route added
    - request shape changed
    - response shape changed
    - error code changed
```

## Agent System

```yaml
- id: agent-contracts
  code:
    - src/agents/**
    - src/tools/**
    - src/prompts/**
  docs:
    - docs/agents.md
    - spec/agents.md
  sync_when:
    - agent role changed
    - tool added
    - prompt output shape changed
    - memory/retrieval behavior changed
```

## Frontend Design System

```yaml
- id: design-system
  code:
    - src/components/ui/**
    - src/styles/**
    - src/tokens/**
  docs:
    - docs/design-system.md
  sync_when:
    - token changed
    - component API changed
    - visual language changed
```
