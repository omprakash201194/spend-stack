
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
"EPIC: Foundations & Project Setup" = @"
## Context
SpendStack needs a production-ready engineering foundation before feature work begins. This epic establishes the repo, app shell, tooling, CI, logging, testing, and development conventions.

## Goal
Create a stable base that allows the team to build features quickly without large refactors.

## Scope
- Monorepo structure
- Electron + React + TypeScript app bootstrap
- Shared package conventions
- Linting, formatting, type-checking
- Test setup
- CI pipeline
- Logging and redaction
- Feature flag framework

## Acceptance Criteria
- Repository uses a clear monorepo structure with apps and shared packages
- Electron app launches locally and loads the React renderer
- Root scripts exist for dev, build, lint, test, and typecheck
- CI runs on pull requests and blocks merge on failure
- Structured logging is available across main process and app services
- Sensitive values are redacted from logs
- Feature flags can gate unfinished functionality
- Initial contributor documentation exists

## Technical Notes
- Preferred stack: Electron + React + TypeScript
- Package manager: npm workspaces
- Architecture should separate UI, application, domain, and infrastructure concerns
- Testing pyramid should include unit, component, integration, and Playwright E2E over time

## Out of Scope
- Business feature implementation
- Cloud sync
- Mobile/web clients

## Dependencies
None
"@

"EPIC: Identity & Family Workspace" = @"
## Context
SpendStack is a multi-profile desktop app that supports both personal finance usage and shared family collaboration, while preserving relationship-level privacy.

## Goal
Allow multiple users on the same device to authenticate, access their own profile, and collaborate within a family workspace.

## Scope
- Local user profiles
- Email/password authentication
- Optional PIN unlock
- Family workspace creation
- Workspace membership
- Relationship privacy controls

## Acceptance Criteria
- Users can create and switch between local profiles
- Users can sign in using email and password
- Passwords are stored securely using hashing
- Users can optionally configure PIN unlock for local convenience
- A family workspace can be created and joined by members
- Relationship privacy rules can limit visibility of selected data
- Access checks are enforced consistently in UI and domain services

## Technical Notes
- Sensitive credential and auth-related fields must be handled securely
- Authorization rules should be explicit and testable
- Privacy behavior should be auditable

## Out of Scope
- External OAuth providers
- Cloud identity federation
- Cross-device sync

## Dependencies
Foundations & Project Setup
"@

"EPIC: Bank Statement Import System" = @"
## Context
SpendStack's initial core value comes from reliable statement imports from Indian banks. The system must support PDF and CSV/XLSX ingestion, normalization, duplicate handling, and source-file lifecycle rules.

## Goal
Build a robust, traceable import pipeline for bank statements.

## Scope
- File upload UX
- Import job creation and tracking
- Bank parser framework
- Support for ICICI, Bank of Baroda, and Kotak
- Duplicate detection with skip/override flow
- Source file retention and cleanup after 7 days
- Import summary and traceability

## Acceptance Criteria
- User can upload supported statement files
- Files are stored in app-managed storage during processing
- Import jobs expose status, result, and failure reason
- Parsers normalize transactions into a shared internal model
- Duplicate records are detected and surfaced before import completion
- User can review skipped duplicates and override where allowed
- Source files are cleaned up after 7 days while normalized records remain
- User receives in-app visibility around cleanup behavior
- Imported transactions maintain traceability back to statement source and row data

## Technical Notes
- Parser engine should support versioned adapters per bank and format
- Parsing failures should be diagnosable
- Review queue integration should be supported for low-confidence rows

## Out of Scope
- OCR-heavy fallback flows unless explicitly required later
- Full open banking integrations
- Live bank connectivity

## Dependencies
Foundations & Project Setup
"@

"EPIC: Transaction Intelligence" = @"
## Context
Raw imported rows are not enough. SpendStack needs transaction normalization and intelligence to make the imported data useful and trustworthy.

## Goal
Transform imported records into high-quality transactions with categorization, transfer detection, and review workflows.

## Scope
- Normalized transaction model
- Own-account transfer detection
- Categorization rules
- Review queue for low-confidence decisions

## Acceptance Criteria
- Imported records are converted into normalized transactions
- System can identify likely own-account transfers across supported accounts
- Rule engine supports deterministic categorization
- Low-confidence items appear in a review queue
- Manual review actions are persisted and auditable

## Technical Notes
- Favor deterministic and explainable logic over opaque heuristics
- Every derived decision should preserve traceability to inputs and rules

## Out of Scope
- Advanced ML-based categorization
- Forecasting and recommendations

## Dependencies
Bank Statement Import System
Audit & Diagnostics
"@

"EPIC: Audit & Diagnostics" = @"
## Context
SpendStack handles sensitive financial workflows and must be transparent about how data was imported, transformed, reviewed, and changed.

## Goal
Provide end-to-end traceability, operational diagnostics, and user-visible audit history.

## Scope
- Audit event model
- Source traceability
- Diagnostics bundle
- Redacted application logging

## Acceptance Criteria
- Important user and system actions generate audit events
- Imported transactions can be traced back to source file and normalized row
- Diagnostics export can be generated for troubleshooting
- Logs avoid leaking sensitive data
- Audit history is human-readable enough for support and user trust

## Technical Notes
- Audit event schema should be stable and versionable
- Diagnostics bundle should avoid raw secrets and unnecessary sensitive payloads

## Out of Scope
- Cloud-based observability stack
- Third-party support console

## Dependencies
Foundations & Project Setup
Bank Statement Import System
Transaction Intelligence
"@

"EPIC: Insights & Analytics" = @"
## Context
SpendStack should eventually provide helpful summaries and analytics while respecting the local-first and privacy-sensitive product direction.

## Goal
Lay the groundwork for balances, cashflow summaries, and privacy-aware insight generation.

## Scope
- Balance summary foundation
- Cashflow summary foundation
- Consent model for AI-assisted insights

## Acceptance Criteria
- App can compute baseline account-level balance and cashflow summaries
- Insight-related permissions and consent are modeled explicitly
- Future AI insight flows can be gated behind clear user consent

## Technical Notes
- AI insight architecture should only operate on anonymized or aggregated data where appropriate and only with explicit user consent
- Keep analytics logic modular and testable

## Out of Scope
- Full budgeting engine
- Full recommendation system
- Cloud-hosted analytics pipeline

## Dependencies
Transaction Intelligence
Audit & Diagnostics
"@

"Setup monorepo with npm workspaces" = @"
## Context
SpendStack is planned as a modular desktop app with multiple layers and shared packages. A clean monorepo is required to avoid entangled code and improve reuse.

## Goal
Initialize the repository as an npm-workspaces monorepo with a scalable package layout.

## Scope
- Root package.json
- npm workspaces configuration
- Shared tsconfig base
- Shared linting and formatting config
- Folder layout for apps and packages

## Acceptance Criteria
- npm install works from the repository root
- Workspace packages are recognized correctly
- Shared TypeScript configuration is reusable by all packages
- Root scripts exist for lint, test, typecheck, and build
- Initial folder structure supports app, domain, infrastructure, and shared code

## Technical Notes
Suggested layout:
- apps/desktop
- packages/ui
- packages/domain
- packages/application
- packages/infrastructure
- packages/importers
- packages/shared

## Out of Scope
- Full feature implementation
"@

"Bootstrap Electron + React + TypeScript desktop app" = @"
## Context
The project needs a functioning desktop shell before domain features can be implemented.

## Goal
Create the initial Electron application with a React renderer and TypeScript across the stack.

## Scope
- Electron main process
- Preload script
- React renderer app
- Secure IPC bridge
- Local dev startup flow

## Acceptance Criteria
- App launches locally in development mode
- Electron main process loads a React renderer
- Preload script is wired correctly
- Renderer can call a minimal safe IPC example
- TypeScript is configured for main, preload, and renderer targets

## Technical Notes
- Keep contextIsolation enabled
- Avoid exposing Node APIs directly to the renderer
- Use preload to publish a narrow, typed bridge

## Out of Scope
- Business-specific screens
- Database and import workflows
"@

"Setup CI pipeline with lint, tests, and typecheck" = @"
## Context
A protected main branch requires automated validation on every pull request.

## Goal
Create a CI workflow that enforces baseline code quality and build safety.

## Scope
- GitHub Actions workflow
- Dependency install
- Lint step
- Typecheck step
- Test step

## Acceptance Criteria
- Workflow runs automatically on pull requests
- Failing lint, typecheck, or tests fail the workflow
- Workflow runtime is reasonable for early-stage development
- Status checks can be required on the default branch

## Technical Notes
- Prefer deterministic installs
- Add caching only if it remains simple and reliable

## Out of Scope
- Release automation
- Packaging and signing
"@

"Implement structured logging with redaction and rotation" = @"
## Context
A desktop finance application needs local diagnostics without exposing sensitive information.

## Goal
Introduce structured local logging with sane retention and secret redaction.

## Scope
- Logging library integration
- Common logger wrapper
- Sensitive-field redaction
- File-based log storage
- Log rotation policy

## Acceptance Criteria
- Application emits structured logs in a machine-readable format
- Sensitive fields are redacted consistently
- Logs are written to app-managed local storage
- Old logs are rotated or pruned according to policy
- Main error paths produce actionable log entries

## Technical Notes
- Redact credentials, tokens, secrets, and sensitive financial fields where appropriate
- Logging should be usable from both Electron main and app service layers

## Out of Scope
- Remote log shipping
"@

"Implement feature flag framework" = @"
## Context
Several SpendStack capabilities will roll out incrementally and may need controlled exposure.

## Goal
Provide a simple feature flag mechanism from day one.

## Scope
- Flag definition model
- Flag lookup API
- Local configuration source
- Renderer-safe access pattern

## Acceptance Criteria
- New features can be conditionally enabled or disabled
- Flags are easy to define and consume in code
- Disabled features fail safely
- Test coverage demonstrates both enabled and disabled behavior

## Technical Notes
- Start local-only; cloud targeting is not needed
- Keep API small and type-safe
"@

"Implement user profile system" = @"
## Context
Multiple people may use SpendStack on the same machine.

## Goal
Support multiple local user profiles with isolated data ownership.

## Scope
- User profile entity
- Profile creation flow
- Profile selection/switching flow
- Storage linkage to user identity

## Acceptance Criteria
- A user can create a profile
- Multiple profiles can exist on one device
- Users can switch between profiles cleanly
- Data access is scoped to the active profile or workspace permissions

## Technical Notes
- Profile identity should integrate cleanly with workspace membership and audit events

## Out of Scope
- Cloud account sync
"@

"Implement email/password authentication" = @"
## Context
SpendStack requires a primary local authentication mechanism.

## Goal
Implement secure email/password login for local profiles.

## Scope
- Registration flow
- Login flow
- Password hashing
- Session handling
- Sign-out behavior

## Acceptance Criteria
- User can register with email and password
- Passwords are stored using secure hashing
- User can sign in and sign out
- Invalid credentials produce clear errors
- Auth state is persisted and restored safely where appropriate

## Technical Notes
- Never store plaintext passwords
- Auth flows should be testable and auditable

## Out of Scope
- Password reset via email
- SSO or OAuth providers
"@

"Implement optional PIN unlock for local access" = @"
## Context
Users may want faster local access after primary authentication is established.

## Goal
Allow users to enable a PIN for convenience unlock on the same device.

## Scope
- PIN enrollment flow
- PIN verification flow
- Settings toggle
- Fallback to primary auth

## Acceptance Criteria
- User can enable or disable PIN unlock
- PIN is not stored in plaintext
- App can unlock with PIN after initial authenticated setup
- Failure and retry behavior is defined
- User can fall back to full credential login

## Technical Notes
- PIN convenience must not weaken primary credential handling
- Treat PIN storage and checks as security-sensitive

## Out of Scope
- Biometric auth
"@

"Implement family workspace creation and membership" = @"
## Context
SpendStack supports shared finance collaboration across a family workspace.

## Goal
Allow users to create a family workspace and manage member participation.

## Scope
- Workspace entity
- Workspace creation flow
- Membership model
- Member add/remove flow

## Acceptance Criteria
- A user can create a family workspace
- Users can be added as members
- Workspace membership is persisted
- Data access can distinguish personal vs shared workspace context

## Technical Notes
- Membership design should support privacy rules and future collaboration features

## Out of Scope
- Real-time invitations across devices
"@

"Implement relationship privacy controls inside family workspace" = @"
## Context
Family collaboration should not imply full visibility of all financial data.

## Goal
Support relationship-based privacy rules inside a shared workspace.

## Scope
- Privacy rule model
- Access policy checks
- UI visibility enforcement
- Auditability of access-sensitive actions

## Acceptance Criteria
- Visibility rules can restrict access to selected data
- Restricted data is not exposed through UI or service APIs
- Policy behavior is testable
- Access-sensitive actions remain auditable

## Technical Notes
- Enforce rules server-side/service-side, not only in UI
- Prefer explicit policy evaluation over implicit checks

## Out of Scope
- Extremely granular custom ACL editor in v1
"@

"Build statement file upload UI" = @"
## Context
Users need a clean import entry point for bank statements.

## Goal
Create the upload UI for statement import workflows.

## Scope
- File picker
- Drag-and-drop
- Validation feedback
- Import initiation
- Progress and status UI

## Acceptance Criteria
- User can select or drag supported files
- Unsupported file types show clear feedback
- Upload action starts an import job
- UI reflects import progress or current state
- Error cases are surfaced clearly

## Technical Notes
- Supported initial formats include PDF and CSV/XLSX depending on bank/parser support
- UI should pass enough metadata to support import diagnostics

## Out of Scope
- Parser implementation itself
"@

"Build import job processing system" = @"
## Context
Statement processing may take time and must be traceable and resilient.

## Goal
Implement an import job model and execution flow.

## Scope
- Import job entity
- Job states
- Job orchestration
- Error recording
- Result summary payload

## Acceptance Criteria
- Import jobs are created for uploads
- Job status transitions are persisted
- Failures capture meaningful diagnostic details
- Completed jobs expose a summary of processed, skipped, and failed rows
- Job state can be surfaced in UI

## Technical Notes
Suggested states:
- queued
- processing
- completed
- failed
- needs_review

## Out of Scope
- Distributed job processing
"@

"Build bank statement parser framework" = @"
## Context
Multiple banks and file formats need a consistent import architecture.

## Goal
Create a parser framework that supports bank-specific adapters and normalized outputs.

## Scope
- Parser interface
- Adapter registry
- Versioning strategy
- Shared normalization contract
- Parser result contract

## Acceptance Criteria
- A parser adapter can be selected by bank and format
- Adapters return a standard normalized structure
- Parser errors are captured consistently
- Framework supports versioning or change isolation for parser evolution

## Technical Notes
- Keep bank-specific logic isolated from shared normalization logic
- Preserve raw source references for auditability

## Out of Scope
- Support for every bank from day one
"@

"Implement ICICI statement parser" = @"
## Context
ICICI is one of the first supported banks for SpendStack imports.

## Goal
Implement an adapter for ICICI statement files.

## Scope
- Supported ICICI input formats
- Row extraction
- Transaction normalization
- Parser validation tests

## Acceptance Criteria
- Supported ICICI files can be parsed successfully
- Extracted rows map into the shared normalized model
- Failures are diagnosable
- Test fixtures cover realistic ICICI samples

## Technical Notes
- Keep bank quirks isolated to this adapter
- Preserve source row references where possible

## Out of Scope
- Universal parser logic unrelated to ICICI
"@

"Implement Bank of Baroda statement parser" = @"
## Context
Bank of Baroda is an initial target bank for statement ingestion.

## Goal
Implement a Bank of Baroda parser adapter compatible with the shared parser framework.

## Scope
- Supported statement format handling
- Row extraction
- Normalization mapping
- Validation tests

## Acceptance Criteria
- Supported Bank of Baroda files parse successfully
- Parsed rows map correctly into normalized transactions
- Parser errors are clear and test-covered
- Fixture-based tests exist for known statement patterns

## Out of Scope
- Parser logic for other banks
"@

"Implement Kotak statement parser" = @"
## Context
Kotak is one of the initial supported banks in SpendStack.

## Goal
Implement a Kotak parser adapter using the shared parser framework.

## Scope
- Kotak statement parsing
- Row extraction
- Shared normalization mapping
- Validation tests

## Acceptance Criteria
- Supported Kotak files parse successfully
- Normalized output matches the internal transaction contract
- Parser failures are diagnosable
- Representative fixtures are covered by tests

## Out of Scope
- Other bank adapters
"@

"Implement duplicate transaction detection with skip summary and override flow" = @"
## Context
Users may import overlapping or repeated statements. SpendStack must avoid silent duplication while still allowing user control.

## Goal
Detect likely duplicate transactions and provide a transparent review flow.

## Scope
- Duplicate matching rules
- Import-time duplicate checks
- Skipped record summary
- User override path

## Acceptance Criteria
- Likely duplicates are detected during import
- User sees which records were skipped
- User can explicitly override and import duplicates where allowed
- Duplicate decisions are traceable in import results
- Logic is covered by tests with edge cases

## Technical Notes
- Matching should balance precision and explainability
- Duplicate reasoning should be inspectable for user trust

## Out of Scope
- Hidden or irreversible duplicate suppression
"@

"Implement statement file lifecycle management with 7-day cleanup" = @"
## Context
Source statement files should be kept temporarily for traceability, then removed from app-managed storage after 7 days.

## Goal
Manage source-file retention and cleanup without losing normalized financial data.

## Scope
- File storage metadata
- Retention timestamps
- Cleanup scheduler or startup cleanup routine
- Safe file deletion

## Acceptance Criteria
- Imported source files are retained in app-managed storage
- Retention policy is 7 days from import or defined retention start
- Cleanup removes source files only, not normalized records
- Cleanup is idempotent and failure-tolerant
- Cleanup actions are auditable

## Technical Notes
- Consider startup reconciliation in addition to scheduled cleanup
- Avoid orphaned metadata and partial cleanup states

## Out of Scope
- Permanent encrypted archive of source files
"@

"Notify users before or during statement source-file cleanup" = @"
## Context
Users should not be surprised when temporary source statement files are removed.

## Goal
Provide in-app visibility around statement file cleanup behavior.

## Scope
- Cleanup notification UX
- Copy/content for retention messaging
- Timing of message display
- Linkage to source-file lifecycle records

## Acceptance Criteria
- User receives clear in-app messaging about temporary source file retention
- Messaging explains that normalized transaction data remains after cleanup
- Notification state does not become noisy or repetitive
- Copy is understandable to non-technical users

## Out of Scope
- Email or push notifications
"@

"Implement normalized transaction model" = @"
## Context
Each bank statement format differs, but downstream product features need a stable transaction representation.

## Goal
Define and implement the normalized transaction model used across the app.

## Scope
- Transaction entity shape
- Required and optional fields
- Import linkage
- Storage mapping
- Validation rules

## Acceptance Criteria
- Normalized model supports core debit/credit transaction use cases
- Transaction records preserve source traceability
- Model is stable enough for categorization, review, and insights
- Validation and mapping rules are documented in code/tests

## Technical Notes
- Design for auditability and future extensibility
- Avoid bank-specific leakage into the normalized shape

## Out of Scope
- Advanced budgeting-specific model additions
"@

"Implement own-account transfer detection" = @"
## Context
Users often move money between their own accounts, and these transfers should be recognized rather than treated as unrelated spending and income.

## Goal
Detect likely transfers between the user's own accounts.

## Scope
- Matching heuristics or rules
- Transfer linkage model
- Confidence handling
- Review path for uncertain matches

## Acceptance Criteria
- System can link likely paired transfer transactions
- Linked transfers are represented explicitly
- Uncertain matches can be reviewed
- False positives are minimized with test coverage

## Technical Notes
- Favor explainable matching based on amount, timing, account ownership, and descriptors
- Preserve manual override capability

## Out of Scope
- External payment network tracing
"@

"Implement categorization rule engine" = @"
## Context
Users need repeatable transaction categorization that can improve over time without opaque behavior.

## Goal
Build a deterministic rule engine for transaction categorization.

## Scope
- Rule model
- Rule evaluation order
- Category assignment
- Manual override compatibility

## Acceptance Criteria
- Rules can map transactions to categories deterministically
- Rule priority/order is defined
- Manual changes do not break system consistency
- Rule evaluation is test-covered and explainable

## Technical Notes
- Priority-based evaluation is preferable for clarity
- Keep future extensibility open for learned suggestions later

## Out of Scope
- ML-first categorization
"@

"Implement review queue for low-confidence transactions" = @"
## Context
Not every imported or inferred transaction decision will be high-confidence.

## Goal
Provide a review queue for transactions requiring user confirmation.

## Scope
- Review queue entity/model
- Queue population rules
- Review actions
- Resolution tracking

## Acceptance Criteria
- Low-confidence items appear in a dedicated review queue
- User can accept, edit, or reject proposed decisions
- Resolutions are persisted and auditable
- Queue state is reflected accurately in UI and storage

## Technical Notes
- Review queue should support duplicate, categorization, and transfer-related uncertainty over time

## Out of Scope
- Bulk automation UI beyond basic review actions
"@

"Implement audit event tracking system" = @"
## Context
The app needs a durable history of important user and system actions.

## Goal
Create a structured audit event model and event recording flow.

## Scope
- Audit event schema
- Event writer API
- Key event coverage
- Event querying support

## Acceptance Criteria
- Important actions generate audit events
- Event payloads include actor, action, timestamp, and relevant subject references
- Audit records are queryable for display and troubleshooting
- Event coverage includes import, review, and cleanup actions

## Technical Notes
- Keep schema stable and version-aware if possible
- Avoid storing unnecessary sensitive payloads

## Out of Scope
- External compliance reporting
"@

"Implement source traceability for imported transactions" = @"
## Context
Users should be able to see where a transaction came from and how it was derived.

## Goal
Link normalized transactions back to source statements and raw imported rows.

## Scope
- Source reference model
- File-to-row-to-transaction linkage
- Query support for traceability UI
- Support for audit workflows

## Acceptance Criteria
- A normalized transaction can be traced to its source statement
- Source row references are preserved where available
- Traceability data supports user-visible audit history
- Missing or partial trace data is handled safely

## Out of Scope
- Full visual trace explorer in the first iteration
"@

"Implement diagnostics bundle export" = @"
## Context
Support and debugging will be much easier if the app can generate a safe diagnostics package.

## Goal
Allow the app to export a local diagnostics bundle for troubleshooting.

## Scope
- Bundle generation flow
- Included artifacts definition
- Redaction/sanitization
- Export location UX

## Acceptance Criteria
- User or developer can generate a diagnostics bundle
- Bundle includes useful logs and metadata
- Sensitive values are redacted or excluded
- Export succeeds reliably and reports failures clearly

## Technical Notes
- Include app version, platform info, key logs, and relevant non-secret metadata
- Exclude raw secrets and unnecessary personal content

## Out of Scope
- Automatic remote upload
"@

"Build balances and cashflow summary foundation" = @"
## Context
SpendStack should provide useful summaries from imported and normalized data.

## Goal
Implement the base computation layer for balances and cashflow summaries.

## Scope
- Aggregation logic
- Summary data contracts
- Period-based calculations
- Account-level and overall views

## Acceptance Criteria
- System can compute basic inflow/outflow summaries for a defined period
- Account-level balance-related summary data can be generated
- Summary logic is test-covered against realistic fixtures
- Computations are reusable by future UI and insights features

## Out of Scope
- Rich dashboard UI
- Forecasting
"@

"Implement consent model for privacy-aware AI insights" = @"
## Context
Any AI-assisted insight feature must align with SpendStack's local-first and privacy-sensitive product direction.

## Goal
Model explicit user consent for any privacy-sensitive AI insight workflow.

## Scope
- Consent record model
- Consent capture flow
- Consent checks in insight paths
- Auditability of consent changes

## Acceptance Criteria
- Consent can be granted and revoked explicitly
- Insight flows can check consent before proceeding
- Consent changes are auditable
- Consent model is flexible enough for future granular policies

## Technical Notes
- Consent should be explicit, revocable, and easy to inspect
- Design should support anonymized or aggregated data policies later

## Out of Scope
- Actual AI insight implementation
"@
}

foreach ($title in $issueBodies.Keys) {
    Set-IssueBodyByTitle -Title $title -Body $issueBodies[$title]
}

Write-Host ""
Write-Host "All mapped issue descriptions updated successfully."
Write-Host ""
