{
  "version": "0.1",
  "project": {
    "name": "{{PROJECT_NAME}}",
    "type": "{{PROJECT_TYPE}}",
    "languages": {{LANGUAGES_JSON}},
    "packageManagers": {{PACKAGE_MANAGERS_JSON}},
    "frameworks": {{FRAMEWORKS_JSON}}
  },
  "entryDocs": {
    "primary": "AGENTS.md",
    "compat": {
      "claude": "CLAUDE.md"
    }
  },
  "docs": {
    "roots": {{DOC_ROOTS_JSON}},
    "designDocs": {{DESIGN_DOCS_JSON}},
    "behaviorSpecs": {{BEHAVIOR_SPECS_JSON}},
    "apiDocs": {{API_DOCS_JSON}}
  },
  "paths": {
    "p0": {{P0_JSON}},
    "p1": {{P1_JSON}},
    "exempt": [
      "**/*.gen.*",
      "**/*.generated.*",
      "**/*.snap",
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/.wrangler/**",
      "**/target/**",
      "**/__pycache__/**",
      "**/vendor/**"
    ]
  },
  "scan": {
    "ignoredDirs": [
      ".agent",
      ".agents",
      ".cache",
      ".claude",
      ".codex",
      ".continue",
      ".cursor",
      ".fmp",
      ".git",
      ".hg",
      ".idea",
      ".iflow",
      ".kiro",
      ".next",
      ".pnpm-store",
      ".svn",
      ".turbo",
      ".vscode",
      ".wrangler",
      "__pycache__",
      "build",
      "coverage",
      "dist",
      "node_modules",
      "target",
      "vendor"
    ]
  },
  "l3Lite": {
    "enabled": true,
    "requiredFor": ["selected-p0"],
    "selectedFiles": [],
    "candidateLimit": 30,
    "maxLines": 6,
    "requiredTags": ["FMP", "MIRROR", "EXPORT", "CHECK"],
    "failOnMissing": false
  },
  "agentsDocs": {
    "maxRootBytes": 24000,
    "maxModuleBytes": 12000,
    "allowNested": true,
    "nestedOnlyFor": ["p0-boundary", "package-boundary", "service-boundary"]
  },
  "mirrorMatrix": ".fmp/mirror-matrix.yaml",
  "checks": {
    "commands": {{CHECK_COMMANDS_JSON}}
  }
}
