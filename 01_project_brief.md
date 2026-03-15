# Personal Finance App — Project Brief and Decision Log

## Overview
This document captures the agreed product direction, architecture preferences, non-functional requirements, and delivery expectations for a local-first personal and family finance desktop application.

## Product Vision
Build a public downloadable personal finance organizer that starts with statement upload and spend analysis, then grows into a broader personal/family finance product.

Primary goals:
- Accurate statement import and normalization
- Strong privacy and local-first behavior
- High trust through auditability and traceability
- Good UI with configurable depth for different user types
- Extensible architecture for future web/mobile apps and sync

## Target Users
- Personal finance users
- Power users managing multiple accounts
- Family households

## Product Model
- Desktop app first
- Future web app and mobile apps
- Public product, not just a personal tool

## Chosen Core Stack
- **Desktop framework:** Electron
- **Frontend:** React + TypeScript
- **Repo strategy:** Monorepo
- **Package manager:** npm
- **Version control:** GitHub
- **Project management:** GitHub Projects
- **Tracking structure:** Epics -> Stories -> Tasks

## Available Antigravity Models
- Gemini 3.1 Pro (High)
- Gemini 3.1 Pro (Low)
- Gemini 3 Flash
- Claude Sonnet 4.6 (Thinking)
- Claude Opus 4.6 (Thinking)
- GPT-OSS 120B (Medium)

## Suggested Antigravity Usage
- **Gemini 3.1 Pro (High):** architecture, schema, parser design, refactors, risk reviews
- **Gemini 3.1 Pro (Low):** careful implementation tasks
- **Gemini 3 Flash:** repetitive UI, boilerplate, tests, docs
- **Claude Sonnet 4.6 (Thinking):** UX, edge cases, parser robustness reviews
- **Claude Opus 4.6 (Thinking):** deeper design review when needed

## Statement Import Scope
### Supported formats in initial plan
- PDF
- CSV/XLSX

### Initial banks
- ICICI Bank
- Bank of Baroda
- Kotak Bank

### Initial account support
- Savings account statements
- Current account statements

### Deferred
- Credit card statements later

## Data and Workspace Model
### Profiles and login
- One desktop installation supports multiple user profiles
- Each family member has their own profile/login on the same device

### Family model
- Shared family workspace
- Relationship privacy inside family is required
- Family view should aggregate shared finance views while respecting privacy controls

## Authentication and Access
### Local auth
- Email + password
- Optional PIN for quick unlock

### Meaning of login
- Unlock local data only for now

### Recovery
- Recovery key supported
- Recovery key should be shown once
- Should be printable/downloadable
- Should be required to reset encrypted local data

## Privacy and AI Policy
### Processing model
- Local-first
- Core functions should work offline
- AI insights optional and disabled unless user enables them in settings

### AI data boundaries
- No raw finance data to external AI by default
- AI must only run on anonymized or aggregated data for now
- User should be explicitly asked for consent

### Consent
- Dedicated privacy/AI consent settings required

## Storage and Retention
### Database security
- Sensitive fields encrypted in DB

### Statement file retention
- User may choose to keep original imported files
- Files stored inside app-managed storage
- No need to encrypt stored originals
- Auto-delete originals after 7 days
- Normalized transactions remain in DB
- User must be notified in-app about retention and cleanup

## Parsing and Import Workflow
### Required flow
1. Statement upload
2. Extraction
3. Normalization
4. Duplicate detection
5. Transfer detection
6. Categorization
7. Review queue for low-confidence rows
8. Finalization

### Duplicate handling
- On upload, if duplicates are found:
  - show skipped records
  - let user accept the skipped behavior
  - allow override to import duplicates
- Defaults should support merging logic and future customization of merge rules

### Low-confidence parsing
- Send rows to a review queue
- Human review is required

### Traceability
Every transaction should preserve source traceability, including:
- source bank
- statement file reference
- original row/line linkage where possible
- raw source text/reference
- parse confidence or diagnostic context

## Categorization and Rules
### Rule behavior
- Automatic categorization plus user-editable rules/categories

### Priority order
1. Manual override
2. User rule
3. Transfer detection
4. Built-in rule
5. AI suggestion
6. Fallback uncategorized

### Explainability
User should be able to see why something happened, such as:
- matched by a user rule
- identified as transfer
- AI suggested with confidence
- recurring pattern explanation

## Transaction Semantics
### Transfers
- Transfers between own accounts should be excluded from spend
- Must be clearly marked as own-account transfers

### Income
Income handling is part of v1, including:
- salary/income category support
- monthly cashflow views
- savings rate estimates

## Analytics and Feature Scope
### v1 includes
- statement import
- parsing and normalization
- human review queue
- categorization and rule editing
- multi-profile support
- family workspace and family view
- spend analysis
- recurring expense detection
- unusual spend alerts
- cashflow trends
- global search
- audit history
- optional AI insights with consent and anonymized/aggregated input only

### v1.1
- budgeting
- export support
- multiple accounts import improvements / broader workflow enhancements as needed

### v1.2
- localization

### v1.5
- cloud sync

### Future
- credit card statements
- biometrics (Windows Hello / Touch ID where available)
- web app
- mobile apps
- bank integrations/open banking-like imports later if desired

## Search
- Global search is required in v1
- Search should cover transactions, merchants, categories, audit events, accounts, and statements where feasible

## Auditing
### Mode
- Strict auditing

### Requirements
- User-visible audit history
- Preserve before/after changes where applicable
- Strong source attribution
- Designed as immutable event log where feasible

## Troubleshooting and Supportability
All of the following are required:
- Simple error popups
- Downloadable diagnostic logs
- Parser debug mode
- Import error report
- “Report issue” package with logs + redacted sample rows
- Health check screen

### Logging
- Full structured logs with rotation
- Automatically redact:
  - account numbers
  - statement file paths
  - merchant raw text if marked sensitive
  - AI request payloads completely

### Crash reporting
- Crash reports should never contain transaction data by default
- Transaction data may be included only when processing fails for a transaction and the user explicitly consents

## Feature Flags
Feature flags required from day one, including support for:
- AI insights
- family view beta features
- new bank parsers
- sync preview

## Performance Targets
- Single statement import target under 10k rows
- Import size should be configurable in settings
- Multiple-account import expansion planned later

## Accessibility
Accessibility is required from day one, including:
- keyboard navigation
- contrast-safe themes
- screen-reader-friendly labels
- larger text option

## UI Direction
- UI should adapt to user preference/style selection
- Support future modes such as:
  - minimal
  - premium modern / polished
  - power-user dashboard
- Dark mode should be configurable in settings

## Delivery and Release Strategy
### Updates
- Manual installer updates first

### Sync planning
- Architecture should anticipate sync from day one
- Cloud sync planned for v1.5

### Auth planning for future
- Future user-account planning is desired if practical

## Testing Strategy Expectations
Quality must be top-notch and resilient against regressions.

Required testing layers:
- Unit tests
- Component tests
- Integration tests
- End-to-end tests with Playwright
- Regression protection in CI
- Automation to generate failed test reports

### Definition of done for every feature
Each feature must include:
- implementation
- unit tests
- integration tests where applicable
- Playwright E2E for user-visible workflows
- docs update
- audit/logging consideration
- rollback/failure behavior review

## Documentation Requirements
Mandatory project documents include:
- Product requirements doc
- Architecture decision records
- Threat model
- DB schema doc
- Parser spec per bank
- Testing strategy
- Release checklist
- Troubleshooting/runbook
- Contributor guide

## GitHub Workflow Expectations
- Feature branches
- PR reviews
- Required checks
- Features added incrementally with fail-safes and tests every time
- Track work in GitHub Projects as Epics -> Stories -> Tasks

## Open Items to Resolve Next
The following still need to be turned into concrete implementation decisions:
- exact monorepo package layout
- local auth design details and password/PIN storage approach
- SQLite encryption strategy and library choice
- statement parser architecture per bank
- review queue UX
- family workspace permissions model
- audit event schema
- search indexing strategy
- diagnostic bundle format
- CI/CD workflow and GitHub Actions setup
- release packaging and installer flow

## Recommended Next Deliverables
1. Product Requirements Document (PRD)
2. Architecture blueprint
3. Domain model and DB schema
4. Security and threat model
5. Parser pipeline design
6. GitHub roadmap with epics/stories/tasks
7. Testing strategy and CI gates
8. Initial folder structure and coding standards
9. Milestone-by-milestone build plan

## Working Principle
Every feature should be introduced one by one with:
- safe defaults
- tests
- docs
- auditability
- failure handling
- clear GitHub ticket tracking

---
This file is the initial shared decision log for the project and should be updated as new architecture and product decisions are made.

