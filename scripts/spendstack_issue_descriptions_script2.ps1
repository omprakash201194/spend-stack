
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

$issueBodies = @{

"EPIC: Identity & Family Workspace" = @"
## Context
SpendStack supports multiple users on a single device and shared family workspaces.

## Goal
Implement identity, authentication, and workspace membership with privacy controls.

## Scope
- User profiles
- Email/password login
- Optional PIN unlock
- Family workspace creation
- Workspace membership
- Privacy rules

## Acceptance Criteria
- Users can create profiles
- Users can log in using email/password
- PIN unlock works after authentication
- Workspace members can collaborate
- Privacy rules enforce data visibility
"@

"EPIC: Bank Statement Import System" = @"
## Context
SpendStack must support reliable statement imports for Indian banks.

## Goal
Build a robust statement ingestion system supporting PDF and CSV/XLSX.

## Scope
- File uploads
- Import job processing
- Parser framework
- Duplicate detection
- 7‑day file lifecycle management

## Acceptance Criteria
- Users can upload statements
- Import jobs process files
- Parsers normalize transactions
- Duplicate transactions are detected
- Files are deleted after retention period
"@

"Setup CI pipeline with lint, tests, and typecheck" = @"
## Goal
Establish CI validation for all pull requests.

## Scope
- GitHub Actions workflow
- Linting
- TypeScript checks
- Unit tests

## Acceptance Criteria
- CI runs on every PR
- Failures block merge
- CI runtime is reasonable
"@

"Implement feature flag framework" = @"
## Goal
Introduce feature flags to enable gradual feature rollout.

## Scope
- Flag configuration
- Feature flag service
- Renderer access

## Acceptance Criteria
- Features can be toggled on/off
- Flags are easy to configure
- Code paths respect flag state
"@

"Implement user profile system" = @"
## Goal
Support multiple local user profiles.

## Scope
- Profile entity
- Profile creation
- Profile switching

## Acceptance Criteria
- Multiple profiles exist
- Users can switch profiles
- Data is scoped per profile
"@

"Implement normalized transaction model" = @"
## Goal
Define the core transaction model used throughout SpendStack.

## Scope
- Transaction entity
- Required fields
- Import linkage
- Validation rules

## Acceptance Criteria
- Model supports debit/credit transactions
- Traceability to import source exists
- Validation rules enforced
"@

"Implement review queue for low-confidence transactions" = @"
## Goal
Allow users to review uncertain transaction decisions.

## Scope
- Review queue model
- Review actions
- Resolution tracking

## Acceptance Criteria
- Transactions needing review appear in queue
- User can confirm or edit entries
- Resolutions persist
"@

}

foreach ($title in $issueBodies.Keys) {
    Set-IssueBodyByTitle -Title $title -Body $issueBodies[$title]
}

Write-Host ""
Write-Host "Additional issue descriptions updated successfully."
Write-Host ""
