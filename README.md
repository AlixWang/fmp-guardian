# fmp-guardian

Generic Fractal Mirror Protocol Skill for agent-native codebases.

This package is intentionally project-agnostic. It does not know your repository paths in advance. It discovers your project and generates local FMP rules under `.fmp/`.

## Install

Copy this folder into your project:

```bash
mkdir -p .agents/skills
cp -R fmp-guardian .agents/skills/fmp-guardian
```

Then initialize FMP:

```bash
node .agents/skills/fmp-guardian/scripts/fmp-init.mjs
```

Optional: add commands to your root `package.json`:

```json
{
  "scripts": {
    "fmp:init": "node .agents/skills/fmp-guardian/scripts/fmp-init.mjs",
    "fmp:check": "node .agents/skills/fmp-guardian/scripts/fmp-check.mjs",
    "fmp:doctor": "node .agents/skills/fmp-guardian/scripts/fmp-doctor.mjs",
    "fmp:seed-l3": "node .agents/skills/fmp-guardian/scripts/fmp-seed-l3.mjs --write",
    "fmp:sync-plan": "node .agents/skills/fmp-guardian/scripts/fmp-sync-plan.mjs",
    "fmp:eval": "node .agents/skills/fmp-guardian/scripts/fmp-eval.mjs"
  }
}
```

## What it creates

```text
AGENTS.md
CLAUDE.md                    # optional compatibility shim
.fmp/config.json
.fmp/mirror-matrix.yaml
.fmp/status.md
```

## Main ideas

- `AGENTS.md` is the primary low-noise agent entry.
- `.fmp/config.json` stores project-local FMP rules.
- `.fmp/mirror-matrix.yaml` maps code areas to semantic mirrors.
- L3-Lite anchors are required only for `l3Lite.selectedFiles` when `requiredFor` is `["selected-p0"]`.
- Project scans ignore common tool and agent metadata directories such as `.agents`, `.claude`, `.codex`, `.cursor`, `.fmp`, `.kiro`, `.vscode`, and build/cache outputs.
- FMP checks help catch code/doc/eval drift.

## Commands

### Initialize

```bash
node .agents/skills/fmp-guardian/scripts/fmp-init.mjs
```

Useful flags:

```bash
--dry-run
--no-claude
--seed-l3
--write-module-agents
```

### Diagnose

```bash
node .agents/skills/fmp-guardian/scripts/fmp-doctor.mjs
```

### Check

```bash
node .agents/skills/fmp-guardian/scripts/fmp-check.mjs
node .agents/skills/fmp-guardian/scripts/fmp-check.mjs --strict
```

### Seed L3-Lite anchors

```bash
node .agents/skills/fmp-guardian/scripts/fmp-seed-l3.mjs
node .agents/skills/fmp-guardian/scripts/fmp-seed-l3.mjs --write
node .agents/skills/fmp-guardian/scripts/fmp-seed-l3.mjs --all-p0
```

By default this command only targets `.fmp/config.json` `l3Lite.selectedFiles`.
Use `--all-p0` only when broad file-header coverage is intentional.

### Generate sync plan

```bash
node .agents/skills/fmp-guardian/scripts/fmp-sync-plan.mjs "change writer agent tool permissions"
```

### Plan or run checks/evals

```bash
node .agents/skills/fmp-guardian/scripts/fmp-eval.mjs
node .agents/skills/fmp-guardian/scripts/fmp-eval.mjs --run
```

## Safety

The initializer is conservative:

- It does not add L3 to every file.
- It stores selected L3 targets in `.fmp/config.json` under `l3Lite.selectedFiles`.
- It does not create nested AGENTS.md everywhere.
- It does not overwrite existing AGENTS.md unless it owns the generated block.
- It marks missing mirrors as FMP debt instead of pretending they exist.
