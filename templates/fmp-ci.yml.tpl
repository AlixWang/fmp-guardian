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
      - name: Check architecture and semantic mirrors
        env:
          FMP_BASE_REF: ${{ github.event.pull_request.base.sha }}
        run: node .agents/skills/fmp-guardian/scripts/fmp-check.mjs --strict
