\
param(
  [string]$ProjectRoot = "."
)

$ErrorActionPreference = "Stop"

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
    Write-Host "Created directory: $Path"
  } else {
    Write-Host "Directory already exists: $Path"
  }
}

function Ensure-File {
  param(
    [string]$Path,
    [string]$Content
  )

  if (-not (Test-Path $Path)) {
    $parent = Split-Path $Path -Parent
    if ($parent -and -not (Test-Path $parent)) {
      New-Item -ItemType Directory -Path $parent | Out-Null
    }
    Set-Content -Path $Path -Value $Content -Encoding UTF8
    Write-Host "Created file: $Path"
  } else {
    Write-Host "File already exists, skipped: $Path"
  }
}

$projectRootResolved = Resolve-Path $ProjectRoot
$repoRoot = $projectRootResolved.Path

Write-Host ""
Write-Host "Bootstrapping SpendStack monorepo in: $repoRoot"
Write-Host ""

$directories = @(
  ".github\ISSUE_TEMPLATE",
  "apps\desktop\src\main",
  "apps\desktop\src\preload",
  "apps\desktop\src\renderer",
  "apps\desktop\public",
  "packages\ui\src",
  "packages\database\src",
  "packages\parser-engine\src",
  "packages\shared\src",
  "docs",
  "scripts",
  "tests\e2e"
)

foreach ($dir in $directories) {
  Ensure-Directory (Join-Path $repoRoot $dir)
}

$rootPackageJson = @'
{
  "name": "spendstack",
  "version": "0.1.0",
  "private": true,
  "description": "Local-first personal and family finance desktop app.",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w apps/desktop",
    "build": "npm run build --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "test:e2e": "npm run test:e2e -w apps/desktop --if-present",
    "format": "npm run format --workspaces --if-present",
    "clean": "npm run clean --workspaces --if-present"
  },
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  }
}
'@

$rootGitignore = @'
node_modules/
dist/
dist-electron/
release/
playwright-report/
test-results/
coverage/
.vscode/
.DS_Store
*.log
.env
.env.*
!.env.example
*.db
*.sqlite
*.sqlite3
'@

$rootNpmrc = @'
fund=false
audit=true
save-exact=true
engine-strict=true
'@

$desktopPackageJson = @'
{
  "name": "@spendstack/desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Electron desktop shell for SpendStack.",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "echo \"TODO: wire Electron + React dev command\"",
    "build": "echo \"TODO: wire Electron + React build command\"",
    "lint": "echo \"TODO: add desktop lint\"",
    "typecheck": "echo \"TODO: add desktop typecheck\"",
    "test": "echo \"TODO: add desktop tests\"",
    "test:e2e": "echo \"TODO: add Playwright E2E\"",
    "clean": "echo \"TODO: add desktop clean\""
  }
}
'@

$uiPackageJson = @'
{
  "name": "@spendstack/ui",
  "version": "0.1.0",
  "private": true,
  "description": "Shared UI components for SpendStack.",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "echo \"TODO: build ui package\"",
    "lint": "echo \"TODO: lint ui package\"",
    "typecheck": "echo \"TODO: typecheck ui package\"",
    "test": "echo \"TODO: test ui package\"",
    "clean": "echo \"TODO: clean ui package\""
  }
}
'@

$databasePackageJson = @'
{
  "name": "@spendstack/database",
  "version": "0.1.0",
  "private": true,
  "description": "Database layer and data access utilities for SpendStack.",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "echo \"TODO: build database package\"",
    "lint": "echo \"TODO: lint database package\"",
    "typecheck": "echo \"TODO: typecheck database package\"",
    "test": "echo \"TODO: test database package\"",
    "clean": "echo \"TODO: clean database package\""
  }
}
'@

$parserPackageJson = @'
{
  "name": "@spendstack/parser-engine",
  "version": "0.1.0",
  "private": true,
  "description": "Statement parsing engine and bank adapters for SpendStack.",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "echo \"TODO: build parser-engine package\"",
    "lint": "echo \"TODO: lint parser-engine package\"",
    "typecheck": "echo \"TODO: typecheck parser-engine package\"",
    "test": "echo \"TODO: test parser-engine package\"",
    "clean": "echo \"TODO: clean parser-engine package\""
  }
}
'@

$sharedPackageJson = @'
{
  "name": "@spendstack/shared",
  "version": "0.1.0",
  "private": true,
  "description": "Shared types, constants, and utilities for SpendStack.",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "echo \"TODO: build shared package\"",
    "lint": "echo \"TODO: lint shared package\"",
    "typecheck": "echo \"TODO: typecheck shared package\"",
    "test": "echo \"TODO: test shared package\"",
    "clean": "echo \"TODO: clean shared package\""
  }
}
'@

$desktopReadme = @'
# SpendStack Desktop App

Electron + React + TypeScript desktop application shell.

## Planned layers
- `src/main` - Electron main process
- `src/preload` - secure preload bridge
- `src/renderer` - React renderer app
- `public` - static assets
'@

$packagesReadme = @'
# Package Notes

This repository uses internal workspace packages for separation of concerns:

- `@spendstack/ui`
- `@spendstack/database`
- `@spendstack/parser-engine`
- `@spendstack/shared`
'@

$docsReadme = @'
# Docs

Place architecture notes, ADRs, bank parser specs, import behavior docs, and roadmap-related technical documents here.
'@

$rootReadme = @'
# SpendStack

SpendStack is a local-first personal and family finance desktop app focused on privacy, auditability, and reliable bank statement imports.

## Repository layout
- `apps/desktop` - Electron desktop app
- `packages/ui` - shared UI components
- `packages/database` - persistence and database utilities
- `packages/parser-engine` - statement parser engine and bank adapters
- `packages/shared` - shared types and utilities
- `docs` - project documentation
- `scripts` - automation and setup scripts
- `tests/e2e` - cross-workspace end-to-end testing assets
'@

$tsIndex = @'
export {};
'@

$files = @(
  @{ Path = "package.json"; Content = $rootPackageJson },
  @{ Path = ".gitignore"; Content = $rootGitignore },
  @{ Path = ".npmrc"; Content = $rootNpmrc },
  @{ Path = "README.md"; Content = $rootReadme },

  @{ Path = "apps\desktop\package.json"; Content = $desktopPackageJson },
  @{ Path = "apps\desktop\README.md"; Content = $desktopReadme },

  @{ Path = "packages\ui\package.json"; Content = $uiPackageJson },
  @{ Path = "packages\ui\README.md"; Content = $packagesReadme },
  @{ Path = "packages\ui\src\index.ts"; Content = $tsIndex },

  @{ Path = "packages\database\package.json"; Content = $databasePackageJson },
  @{ Path = "packages\database\src\index.ts"; Content = $tsIndex },

  @{ Path = "packages\parser-engine\package.json"; Content = $parserPackageJson },
  @{ Path = "packages\parser-engine\src\index.ts"; Content = $tsIndex },

  @{ Path = "packages\shared\package.json"; Content = $sharedPackageJson },
  @{ Path = "packages\shared\src\index.ts"; Content = $tsIndex },

  @{ Path = "docs\README.md"; Content = $docsReadme },
  @{ Path = "tests\e2e\.gitkeep"; Content = "" }
)

foreach ($file in $files) {
  Ensure-File -Path (Join-Path $repoRoot $file.Path) -Content $file.Content
}

Write-Host ""
Write-Host "SpendStack monorepo bootstrap complete."
Write-Host ""
Write-Host "Next suggested commands:"
Write-Host "  npm install"
Write-Host "  git status"
Write-Host ""
