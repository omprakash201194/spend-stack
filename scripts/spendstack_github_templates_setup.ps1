
$ErrorActionPreference = "Stop"

Write-Host "Setting up GitHub templates and CI..."

# Create directories
$issueTemplateDir = ".github/ISSUE_TEMPLATE"
$workflowDir = ".github/workflows"

New-Item -ItemType Directory -Force -Path $issueTemplateDir | Out-Null
New-Item -ItemType Directory -Force -Path $workflowDir | Out-Null

# epic.yml
@"
name: Epic
description: Large initiative spanning multiple stories
labels: ["epic"]

body:
  - type: textarea
    id: context
    attributes:
      label: Context
      description: Why this epic exists
  - type: textarea
    id: goals
    attributes:
      label: Goals
  - type: textarea
    id: scope
    attributes:
      label: Scope
  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance Criteria
"@ | Set-Content "$issueTemplateDir/epic.yml"

# story.yml
@"
name: Story
description: Feature or user-facing capability
labels: ["story"]

body:
  - type: textarea
    id: context
    attributes:
      label: Context
  - type: textarea
    id: goal
    attributes:
      label: Goal
  - type: textarea
    id: scope
    attributes:
      label: Scope
  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance Criteria
"@ | Set-Content "$issueTemplateDir/story.yml"

# bug.yml
@"
name: Bug
description: Report a bug
labels: ["bug"]

body:
  - type: textarea
    id: description
    attributes:
      label: Bug Description
  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
  - type: textarea
    id: environment
    attributes:
      label: Environment
"@ | Set-Content "$issueTemplateDir/bug.yml"

# task.yml
@"
name: Task
description: Engineering task
labels: ["task"]

body:
  - type: textarea
    id: description
    attributes:
      label: Task Description
  - type: textarea
    id: details
    attributes:
      label: Implementation Notes
  - type: textarea
    id: done
    attributes:
      label: Definition of Done
"@ | Set-Content "$issueTemplateDir/task.yml"

# PR template
@"
## Summary
Explain what this PR does.

## Related Issue
Fixes #

## Changes
- change 1
- change 2

## Testing
How was this tested?

## Checklist
- [ ] Tests added
- [ ] Documentation updated
- [ ] CI passing
"@ | Set-Content ".github/pull_request_template.md"

# CI workflow
@"
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm install
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
"@ | Set-Content "$workflowDir/ci.yml"

Write-Host ""
Write-Host "GitHub templates and CI workflow created successfully."
Write-Host ""
Write-Host "Created files:"
Write-Host ".github/ISSUE_TEMPLATE/epic.yml"
Write-Host ".github/ISSUE_TEMPLATE/story.yml"
Write-Host ".github/ISSUE_TEMPLATE/bug.yml"
Write-Host ".github/ISSUE_TEMPLATE/task.yml"
Write-Host ".github/pull_request_template.md"
Write-Host ".github/workflows/ci.yml"
Write-Host ""
