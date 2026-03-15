
$ErrorActionPreference = "Stop"

$OWNER = "omprakash201194"
$REPO = "spend-stack"
$REPO_FULL = "$OWNER/$REPO"

function Set-IssueBodyByTitle {
    param(
        [string]$Title,
        [string]$Body
    )

    $issues = gh issue list `
        --repo $REPO_FULL `
        --state all `
        --limit 200 `
        --json number,title | ConvertFrom-Json

    $match = $issues | Where-Object { $_.title -eq $Title } | Select-Object -First 1

    if (-not $match) {
        Write-Warning "Issue not found: $Title"
        return
    }

    $tmpFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tmpFile -Value $Body -Encoding UTF8

    gh issue edit $match.number `
        --repo $REPO_FULL `
        --body-file $tmpFile | Out-Null

    Remove-Item $tmpFile -Force

    Write-Host "Updated issue #$($match.number): $Title"
}

# --------------------------
# ISSUE DESCRIPTIONS
# --------------------------

$epicFoundations = @"
## Context
SpendStack needs a stable engineering foundation before feature work begins.

## Goal
Create a production-ready base for development including tooling, CI, and project structure.

## Scope
- Monorepo setup
- Electron + React + TypeScript bootstrap
- CI pipeline
- Logging
- Feature flags

## Acceptance Criteria
- Electron app launches successfully
- React renderer loads
- CI runs lint, tests, and typecheck
- Feature flags can enable/disable features
- Logging framework is available across the app

## Technical Notes
Stack:
Electron
React
TypeScript
npm workspaces

## Out of Scope
Feature development
"@

$monorepoSetup = @"
## Context
SpendStack will use a modular architecture with shared packages.

## Goal
Initialize the repository as a monorepo using npm workspaces.

## Scope
- Root package.json
- npm workspace configuration
- Shared TypeScript config
- ESLint and Prettier setup
- Root development scripts

## Acceptance Criteria
- npm install works from repo root
- Workspace packages resolve correctly
- Shared TypeScript configuration works across packages

## Suggested Structure
apps/
  desktop/

packages/
  domain/
  infrastructure/
  ui/
  shared/
"@

$electronBootstrap = @"
## Context
The application needs a working desktop shell before domain features can be implemented.

## Goal
Create an Electron desktop application with a React renderer and TypeScript.

## Scope
- Electron main process
- Preload script
- React renderer
- IPC bridge
- Dev startup scripts

## Acceptance Criteria
- App launches locally
- React UI renders
- IPC communication works
- TypeScript compiles for all layers

## Security Requirements
- contextIsolation enabled
- No direct Node API exposure in renderer
"@

# --------------------------
# APPLY UPDATES
# --------------------------

Set-IssueBodyByTitle -Title "EPIC: Foundations & Project Setup" -Body $epicFoundations
Set-IssueBodyByTitle -Title "Setup monorepo with npm workspaces" -Body $monorepoSetup
Set-IssueBodyByTitle -Title "Bootstrap Electron + React + TypeScript desktop app" -Body $electronBootstrap

Write-Host ""
Write-Host "Issue descriptions updated successfully."
Write-Host ""
