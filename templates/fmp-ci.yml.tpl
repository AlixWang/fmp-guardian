name: FMP

on:
  pull_request:

jobs:
  architecture-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: |
          corepack enable || true
          if [ -f pnpm-lock.yaml ]; then
            pnpm install --frozen-lockfile
          elif [ -f yarn.lock ]; then
            yarn install --frozen-lockfile
          elif [ -f package-lock.json ]; then
            npm ci
          elif [ -f package.json ]; then
            npm install
          fi
      - name: Run configured checks and evals
        run: node .agents/skills/fmp-guardian/scripts/fmp-eval.mjs --run
      - name: Check architecture and semantic mirrors
        env:
          FMP_BASE_REF: ${{ github.event.pull_request.base.sha }}
        run: node .agents/skills/fmp-guardian/scripts/fmp-check.mjs --strict
