
$ErrorActionPreference = "Stop"

$OWNER = "omprakash201194"
$REPO = "spend-stack"
$REPO_FULL = "$OWNER/$REPO"

function Set-IssueBodyByTitle {
    param(
        [string]$Title,
        [string]$Body
    )

    $issue = gh issue list `
        --repo $REPO_FULL `
        --state all `
        --limit 200 `
        --search "$Title in:title" `
        --json number,title | ConvertFrom-Json

    $match = $issue | Where-Object { $_.title -eq $Title } | Select-Object -First 1

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

# -------------------------
# EXAMPLE ISSUE DESCRIPTION UPDATES
# (You can expand this file with more issues if needed)
# -------------------------

Set-IssueBodyByTitle -Title "EPIC: Foundations & Project Setup" -Body @"
## Context
SpendStack needs a production-ready engineering foundation before feature work begins.

## Goal
Create a stable base that allows the team to build features quickly without large refactors.

## Scope
- Monorepo structure
- Electron + React + TypeScript bootstrap
- Shared tooling and packages
- CI pipeline
- Logging and feature flags

## Acceptance Criteria
- Electron app boots locally
- React renderer loads successfully
- CI runs lint, typecheck, and tests
- Feature flags can toggle unfinished features
- Logging framework available across the application

## Technical Notes
Preferred stack:
- Electron
- React
- TypeScript
- npm workspaces
- SQLite later for storage

## Out of Scope
- Feature development
- Import pipelines
\"@


Set-IssueBodyByTitle -Title "Setup monorepo with npm workspaces" -Body @"
## Context
SpendStack will use a modular architecture with shared packages.

## Goal
Initialize the repository as a monorepo using npm workspaces.

## Scope
- Root package.json
- npm workspace configuration
- Shared tsconfig
- Lint + prettier config
- Root scripts

## Acceptance Criteria
- npm install works from repo root
- Workspace packages resolve correctly
- Shared TypeScript config usable by all packages

## Suggested Structure
apps/
    desktop/

packages/
    ui/
    domain/
    infrastructure/
    shared/

## Out of Scope
Feature implementation
\"@


Set-IssueBodyByTitle -Title "Bootstrap Electron + React + TypeScript desktop app" -Body @"
## Context
The application needs a working desktop shell before features can be built.

## Goal
Create the Electron desktop app with a React renderer.

## Scope
- Electron main process
- Preload script
- React renderer
- IPC bridge
- Dev startup scripts

## Acceptance Criteria
- App launches locally
- Renderer loads React
- IPC communication works
- TypeScript works for main + renderer

## Security Requirements
- contextIsolation enabled
- No direct Node API exposure to renderer

## Out of Scope
Business logic implementation
\"@


Write-Host ""
Write-Host "Issue descriptions updated successfully."
Write-Host ""
