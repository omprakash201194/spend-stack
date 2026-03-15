# SpendStack — Product Requirements, Architecture Blueprint, and Roadmap

## 1. Product Requirements Document (PRD)

### 1.1 Product Vision
SpendStack is a **local‑first personal and family finance desktop application** that helps users understand their finances by analyzing bank statements and turning them into clear insights about spending, income, and financial trends.

The product prioritizes:

- Accuracy of financial data
- Strong privacy guarantees
- Local‑first architecture
- Transparent financial insights
- Extensibility for future cloud sync and mobile apps

The long‑term goal is to provide a **trusted personal finance organizer** for individuals and families.

---

# 1.2 Target Users

### Individual users
People who want to understand their spending habits and financial health.

### Power users
Users managing multiple accounts who want deeper analytics.

### Family households
Families who want a combined view of spending while maintaining relationship privacy.

---

# 1.3 Core Principles

### Local‑First
All core functionality works without internet connectivity.

### Privacy‑First
Sensitive financial data never leaves the user's device unless explicitly allowed.

### Transparency
Users can always see:

- where their data came from
- how transactions were categorized
- what rules or AI suggestions were used

### Auditability
Every financial change must be traceable.

### Extensibility
Architecture should support:

- cloud sync
- mobile apps
- additional banks

---

# 1.4 Core Features (v1)

### Statement Import
Users can upload bank statements in:

- PDF
- CSV
- XLSX

Initial banks supported:

- ICICI Bank
- Bank of Baroda
- Kotak Bank

Account types supported:

- Savings accounts
- Current accounts

Credit card statements will be added later.

---

### Parsing & Normalization
Statements are processed through a pipeline:

1. Upload
2. Extraction
3. Parsing
4. Normalization
5. Duplicate detection
6. Transfer detection
7. Categorization
8. Review queue
9. Finalization

---

### Duplicate Detection
If duplicate transactions are detected:

Users will see skipped records.

Users can:

- accept skipped duplicates
- override and import anyway

---

### Review Queue
Transactions with low parsing confidence are placed in a **review queue**.

Users must review these transactions before finalizing the import.

---

### Categorization
Transactions are categorized using a priority rule engine:

1. Manual override
2. User rule
3. Transfer detection
4. Built‑in rules
5. AI suggestion
6. Uncategorized fallback

Users can create custom rules to automate categorization.

---

### Transfer Detection
Transfers between a user's own accounts are:

- automatically detected
- excluded from spending analytics
- labeled as "Own Account Transfer"

---

### Family Workspace
SpendStack supports multiple user profiles.

Users can join a **shared family workspace**.

Features include:

- combined spending view
- relationship privacy
- selective account sharing

---

### Spend Analytics
SpendStack generates insights such as:

- category spending breakdown
- recurring expense detection
- unusual spend alerts
- monthly cash flow
- savings rate estimates

---

### Global Search
Users can search across:

- transactions
- merchants
- categories
- audit history
- accounts

---

### Audit Trail
SpendStack maintains a strict audit system.

Each change records:

- timestamp
- action
- previous value
- new value
- source

Users can view audit history inside the app.

---

### AI Insights
AI insights are optional.

AI is only used when the user:

- explicitly enables AI
- consents to privacy terms

AI receives **only anonymized or aggregated data**.

---

# 1.5 Security Requirements

Authentication:

- Email + password login
- Optional PIN unlock

Recovery:

- Recovery key shown once
- Printable/downloadable

Data protection:

- Sensitive DB fields encrypted

Statement retention:

- Original files stored temporarily
- Auto deleted after **7 days**
- Users notified before cleanup

---

# 1.6 Non‑Functional Requirements

### Performance

Single statement import target:

- up to 10,000 rows

### Reliability

System must tolerate parsing failures without data corruption.

### Observability

Application includes:

- structured logging
- diagnostic export
- parser debug mode

### Accessibility

App must support:

- keyboard navigation
- contrast‑safe UI
- screen reader labels

---

# 2. Architecture Blueprint

## 2.1 High Level Architecture

SpendStack follows a **local‑first layered architecture**.

Components:

- Electron Desktop Shell
- React Frontend
- Domain Services
- Parsing Engine
- Rules Engine
- Audit System
- SQLite Database

Architecture style:

Domain‑driven modular architecture.

---

# 2.2 Monorepo Structure

```
spendstack/

apps/
  desktop/

packages/
  finance-domain/
  parser-engine/
  rules-engine/
  audit-log/
  ui/

infra/
  logging/
  feature-flags/

scripts/

docs/

tests/
```

---

# 2.3 Electron Architecture

Electron has two processes:

### Main Process
Handles:

- filesystem
- database access
- statement parsing
- audit logging

### Renderer Process
React UI responsible for:

- dashboards
- transaction views
- review queue

Communication via IPC.

---

# 2.4 Core Domain Modules

### Finance Domain

Handles:

- accounts
- transactions
- categories
- income detection

---

### Parser Engine

Responsible for:

- bank statement parsing
- bank‑specific adapters
- normalization

Each bank has its own parser.

---

### Rules Engine

Handles categorization rules.

Examples:

- merchant name rules
- keyword rules
- recurring pattern rules

---

### Audit System

Implements append‑only event log.

Events include:

- imports
- edits
- rule creation

---

### Feature Flags

Used to safely enable:

- AI insights
- experimental parsers
- sync preview

---

# 2.5 Database

Primary storage:

SQLite

Data model includes:

- users
- workspaces
- accounts
- statements
- transactions
- categories
- rules
- audit_events

Sensitive columns encrypted.

---

# 2.6 Logging System

Structured logs with rotation.

Logs automatically redact:

- account numbers
- sensitive identifiers

Users can export logs for troubleshooting.

---

# 2.7 Testing Architecture

SpendStack follows a full testing pyramid.

### Unit Tests

Test individual modules.

### Component Tests

Test UI components.

### Integration Tests

Test module interactions.

### End‑to‑End Tests

Playwright tests simulate real user flows.

CI generates reports for failing cases.

---

# 3. GitHub Project Roadmap

Development will be tracked in GitHub Projects.

Structure:

Epics → Stories → Tasks

---

# Epic 1 — Core Platform Setup

Stories:

- Monorepo setup
- Electron app scaffold
- React UI setup
- Logging framework
- Feature flags

---

# Epic 2 — Authentication & Profiles

Stories:

- local authentication
- profile management
- PIN unlock
- recovery key system

---

# Epic 3 — Statement Import System

Stories:

- file upload system
- parser engine
- bank adapters
- duplicate detection

---

# Epic 4 — Transaction Engine

Stories:

- normalization pipeline
- transfer detection
- transaction storage

---

# Epic 5 — Categorization & Rules

Stories:

- rule engine
- rule editor
- auto categorization

---

# Epic 6 — Review Queue

Stories:

- parsing confidence model
- review interface
- approval workflow

---

# Epic 7 — Analytics Dashboard

Stories:

- spend insights
- category breakdown
- income tracking
- recurring expense detection

---

# Epic 8 — Audit System

Stories:

- event model
- audit storage
- audit viewer UI

---

# Epic 9 — Search

Stories:

- global search engine
- search UI

---

# Epic 10 — AI Insights

Stories:

- anonymization pipeline
- AI insights engine
- AI settings

---

# Epic 11 — Testing Infrastructure

Stories:

- unit test framework
- Playwright E2E
- CI test reporting

---

# Epic 12 — Packaging & Installer

Stories:

- desktop build pipeline
- installer generation

---

# Post‑v1 Roadmap

### v1.1

- budgeting
- export reports

### v1.2

- localization

### v1.5

- cloud sync

---

# 4. Development Workflow

Development uses:

- feature branches
- PR reviews
- required CI checks

Definition of done:

Every feature must include:

- code implementation
- tests
- documentation
- logging coverage

---

# 5. Documentation

Required project documentation:

- architecture decision records
- threat model
- parser specifications
- release checklist
- troubleshooting guide

---

# 6. Detailed Technical Design

## 6.1 Domain Model

SpendStack should use a domain-driven model organized around clear business concepts.

### Core bounded contexts

#### Identity and Access
Responsible for:
- local profiles
- authentication
- PIN unlock
- recovery key flows
- session state

#### Workspace and Family
Responsible for:
- personal profiles
- shared family workspace
- membership
- privacy boundaries
- account sharing rules

#### Statement Import
Responsible for:
- file intake
- retention lifecycle
- bank parser selection
- extraction and parse jobs
- duplicate detection
- review queue generation

#### Transaction Intelligence
Responsible for:
- normalized transactions
- transfer detection
- categorization
- recurring detection
- income detection
- analytics-ready enrichment

#### Rules and Categorization
Responsible for:
- user rules
- built-in rules
- rule priority
- category mapping
- explainability metadata

#### Audit and Diagnostics
Responsible for:
- immutable audit events
- activity timeline
- structured logs
- diagnostics export
- parser debug artifacts

#### Insights
Responsible for:
- dashboards
- summaries
- spending trends
- cashflow metrics
- optional AI insight generation

---

## 6.2 Primary Entities

### UserProfile
Represents a local user who can sign into the app on a device.

Key fields:
- id
- email
- display_name
- password_hash
- password_salt
- pin_hash (optional)
- recovery_key_hash
- created_at
- updated_at
- last_login_at
- status

Notes:
- Email is used for login identity.
- Passwords and PINs are never stored in plaintext.
- Recovery key should be generated once and only its hash should be stored.

### FamilyWorkspace
Represents a shared finance space that can aggregate data across multiple user profiles.

Key fields:
- id
- name
- created_by_user_id
- created_at
- updated_at
- status

### WorkspaceMember
Connects a user profile to a family workspace.

Key fields:
- id
- workspace_id
- user_id
- role
- joined_at
- status

Roles may include:
- owner
- adult_member
- viewer

### Account
Represents a financial account imported into the system.

Key fields:
- id
- workspace_id
- owner_user_id
- bank_name
- account_type
- display_name
- masked_account_number
- encrypted_account_number
- currency
- sharing_visibility
- created_at
- updated_at
- archived_at

Notes:
- sharing_visibility supports relationship privacy.
- Example values: private, workspace_shared, selected_members.

### StatementFile
Represents an uploaded original bank statement file.

Key fields:
- id
- workspace_id
- uploaded_by_user_id
- account_id (nullable until matched)
- source_bank
- file_name
- file_type
- file_size_bytes
- storage_path
- retention_policy
- delete_after_at
- deletion_status
- keep_original_requested
- created_at

Notes:
- Original files live in app-managed storage.
- Auto-delete runs after 7 days if file retention is enabled.
- Normalized rows remain even after source file cleanup.

### ImportJob
Represents one processing run for a statement import.

Key fields:
- id
- statement_file_id
- parser_id
- parser_version
- import_status
- started_at
- completed_at
- total_rows_detected
- rows_parsed
- rows_flagged_for_review
- duplicate_rows_skipped
- duplicate_rows_overridden
- error_summary
- initiated_by_user_id

Status examples:
- uploaded
- parsing
- review_required
- finalized
- failed
- cancelled

### RawStatementRow
Stores the extracted raw row/line representation from the source statement.

Key fields:
- id
- import_job_id
- statement_file_id
- source_reference
- raw_text
- extracted_date_text
- extracted_amount_text
- extracted_description_text
- extraction_metadata_json
- created_at

Purpose:
- preserves source traceability
- supports debugging and review UX

### Transaction
Represents a normalized financial transaction.

Key fields:
- id
- workspace_id
- account_id
- owner_user_id
- import_job_id
- raw_statement_row_id
- transaction_date
- posted_date
- amount
- direction
- merchant_display
- description_normalized
- category_id
- subcategory_id (nullable)
- transaction_type
- transfer_group_id (nullable)
- recurrence_group_id (nullable)
- confidence_score
- review_status
- duplicate_status
- lifecycle_status
- source_bank
- source_statement_id
- created_at
- updated_at

Enums/examples:
- direction: debit, credit
- review_status: pending, approved, corrected
- duplicate_status: unique, skipped_duplicate, imported_override
- lifecycle_status: active, excluded, deleted

### Category
Represents a transaction category.

Key fields:
- id
- workspace_id (nullable for system categories)
- name
- parent_category_id
- category_kind
- color_token
- icon_token
- is_system
- created_at
- updated_at

Examples:
- Food & Dining
- Salary
- Utilities
- Transfer

### CategorizationRule
Represents user-defined or system-defined transaction categorization rules.

Key fields:
- id
- workspace_id
- created_by_user_id
- name
- priority
- rule_scope
- match_type
- match_expression
- target_category_id
- target_subcategory_id
- action_type
- is_enabled
- created_at
- updated_at

Examples:
- match description contains "SWIGGY"
- match merchant equals "UBER"
- match amount range + keyword

### ReviewQueueItem
Represents a transaction or row needing human validation.

Key fields:
- id
- import_job_id
- transaction_id (nullable until normalized)
- raw_statement_row_id
- queue_reason
- suggested_fix_json
- assigned_user_id (nullable)
- status
- created_at
- resolved_at
- resolution_note

Queue reasons may include:
- low_confidence_parse
- duplicate_conflict
- ambiguous_transfer
- missing_date
- missing_amount
- parser_warning

### TransferLink
Represents a detected transfer between own accounts.

Key fields:
- id
- workspace_id
- debit_transaction_id
- credit_transaction_id
- detection_method
- confidence_score
- status
- created_at

### RecurrenceGroup
Represents recurring spend or income detection.

Key fields:
- id
- workspace_id
- recurrence_type
- merchant_fingerprint
- average_amount
- cadence
- last_detected_at
- confidence_score
- created_at
- updated_at

### InsightSnapshot
Stores precomputed analytics snapshots for performance and history.

Key fields:
- id
- workspace_id
- snapshot_type
- period_start
- period_end
- payload_json
- generated_by
- created_at

### ConsentRecord
Tracks user consent decisions.

Key fields:
- id
- user_id
- consent_type
- consent_version
- granted
- granted_at
- revoked_at
- metadata_json

Examples:
- AI insights enabled
- crash report data sharing
- transaction-level failure payload sharing

### AuditEvent
Represents immutable user-visible audit history.

Key fields:
- id
- workspace_id
- actor_user_id
- event_type
- entity_type
- entity_id
- occurred_at
- source_type
- reason_code
- before_json
- after_json
- explanation_text
- correlation_id

Examples:
- TRANSACTION_CATEGORY_CHANGED
- IMPORT_FINALIZED
- RULE_CREATED
- FILE_AUTO_DELETED

---

## 6.3 Relationship Model

### High-level relationships
- A UserProfile can belong to many FamilyWorkspaces through WorkspaceMember.
- A FamilyWorkspace contains many Accounts.
- An Account has many StatementFiles and many Transactions.
- A StatementFile may produce one or more ImportJobs over time.
- An ImportJob produces RawStatementRows, ReviewQueueItems, and Transactions.
- A Transaction may belong to a Category, RecurrenceGroup, or TransferLink.
- AuditEvents can reference any major entity.

### Family privacy model
Each account belongs to an owner but lives inside a shared family workspace.

Recommended visibility model:
- private: visible only to owner
- workspace_shared: visible to all workspace members
- selected_members: visible only to a subset defined in a join table

Additional table for selected sharing:

#### AccountVisibilityGrant
- id
- account_id
- granted_to_user_id
- granted_by_user_id
- created_at

This allows relationship privacy without duplicating account data.

---

## 6.4 Database Schema Outline

Recommended primary database: SQLite

Recommended schema groups:
- auth_
- workspace_
- import_
- finance_
- rules_
- audit_
- diagnostics_
- insights_

Suggested table set:
- user_profiles
- family_workspaces
- workspace_members
- accounts
- account_visibility_grants
- statement_files
- import_jobs
- raw_statement_rows
- transactions
- categories
- categorization_rules
- review_queue_items
- transfer_links
- recurrence_groups
- insight_snapshots
- consent_records
- audit_events
- feature_flag_overrides
- app_settings
- diagnostics_reports

---

## 6.5 Sensitive Data Classification

### Encrypted in DB
These fields should be encrypted at rest in the database:
- full account number
- recovery artifacts if stored beyond hash references
- any sensitive bank identifiers
- any personally sensitive free-text fields that cannot be safely tokenized

### Stored as hash only
- password
- PIN
- recovery key

### Safe to store unencrypted
- masked account number
- category names
- normalized merchant labels unless user later marks them sensitive
- aggregate analytics snapshots

---

## 6.6 Import and Parsing Architecture

### Pipeline stages

#### Stage 1: Intake
- user uploads PDF/CSV/XLSX
- system creates StatementFile and ImportJob
- retention cleanup timestamp is assigned if original file is kept

#### Stage 2: Parser Resolution
- determine parser based on bank + file type
- record parser version on ImportJob

#### Stage 3: Extraction
- PDF: table/text extraction into RawStatementRows
- CSV/XLSX: row mapping into RawStatementRows

#### Stage 4: Normalization
Convert raw rows into normalized Transaction records using a common canonical model.

Canonical transaction fields:
- date
- description
- debit_amount
- credit_amount
- signed_amount
- balance_if_available
- currency
- raw reference

#### Stage 5: Duplicate Detection
Apply duplicate matching strategy:
- exact match auto-skip by default
- fuzzy candidates surfaced to user/review flow
- user override allowed

Suggested default duplicate fingerprint:
- account_id
- transaction_date
- amount
- normalized_description_hash

#### Stage 6: Transfer Detection
Attempt to link transfers between owned accounts using:
- same/near date
- opposite direction
- near-equal amount
- transfer keywords

#### Stage 7: Categorization
Apply rule priority:
1. manual override
2. user rule
3. transfer detection
4. built-in rule
5. AI suggestion
6. uncategorized

#### Stage 8: Review Queue
Create ReviewQueueItems for:
- low parse confidence
- duplicate ambiguity
- transfer ambiguity
- missing mandatory fields

#### Stage 9: Finalization
Only approved/finalized rows become active in analytics.

---

## 6.7 Parser Engine Design

### Goals
- bank-specific parsing with shared normalization
- versioned parser behavior
- easy addition of new banks
- strong debuggability

### Recommended parser package structure

```
packages/parser-engine/
  core/
  banks/
    icici/
    bank-of-baroda/
    kotak/
  shared/
  fixtures/
```

### Core interfaces

#### ParserDefinition
Defines:
- parser_id
- bank_name
- supported_file_types
- parser_version
- detect()
- extract()
- normalize()
- validate()

#### ParseResult
Includes:
- raw rows
- normalized candidates
- parser warnings
- confidence summaries
- debug metadata

### Parser versioning
Every import stores parser version so later changes do not silently rewrite history.

### Golden test fixtures
Each bank parser should have fixture-based regression tests:
- known-good PDFs
- known-good CSV/XLSX files
- expected normalized outputs

---

## 6.8 Review Queue Workflow

### Required UX flow
1. Import completes with review_required state if any flagged rows exist.
2. User opens import review screen.
3. Rows are grouped by issue type.
4. User can approve, edit, merge, skip, or mark as duplicate.
5. Finalize import after all required issues are resolved.

### Queue decision outcomes
- approve as parsed
- edit and approve
- exclude row
- mark duplicate
- mark transfer
- retry parser on row if supported later

### Audit coverage
Every resolution action should emit an AuditEvent.

---

## 6.9 Rules Engine Design

### Rule types
- text contains
- exact merchant match
- regex match
- amount range
- account scoped rule
- workspace-wide rule
- income detection rule

### Rule scope
- personal only
- workspace shared
- system built-in

### Explainability output
Each categorized transaction should store categorization metadata, for example:
- matched_rule_id
- matched_rule_name
- categorization_source
- confidence
- explanation_text

This powers the “Why did this happen?” feature.

---

## 6.10 Analytics and Search Design

### Derived analytics
Prefer a hybrid model:
- raw source of truth in transactions
- precomputed summaries for expensive queries

Examples of summary jobs:
- monthly category totals
- income vs spend trends
- recurring transactions summary
- transfer exclusion summaries

### Search
Recommended first version:
- SQLite FTS for global search over transactions, merchants, categories, audit explanations, and statement metadata

Search should support filters for:
- date range
- account
- category
- user/profile
- workspace visibility

---

## 6.11 Audit Event Model

### Design principles
- append-only
- user-visible
- human-readable explanations
- correlation IDs across workflows

### Core audit event types
- USER_LOGIN_SUCCEEDED
- USER_LOGIN_FAILED
- PIN_UNLOCK_SUCCEEDED
- STATEMENT_UPLOADED
- IMPORT_STARTED
- IMPORT_REVIEW_REQUIRED
- IMPORT_FINALIZED
- IMPORT_FAILED
- DUPLICATE_OVERRIDDEN
- TRANSACTION_CREATED
- TRANSACTION_UPDATED
- TRANSACTION_EXCLUDED
- CATEGORY_RULE_CREATED
- CATEGORY_RULE_UPDATED
- CATEGORY_RULE_DISABLED
- TRANSACTION_CATEGORY_CHANGED
- TRANSFER_LINK_CREATED
- REVIEW_ITEM_RESOLVED
- FILE_RETENTION_WARNING_SHOWN
- FILE_AUTO_DELETED
- AI_CONSENT_GRANTED
- AI_CONSENT_REVOKED

### What to store in before/after
Store minimal but useful snapshots, not huge payloads.
Example:
- category before/after
- review status before/after
- duplicate decision before/after

---

## 6.12 Diagnostics and Troubleshooting Design

### Structured logs
Recommended fields:
- timestamp
- level
- service/module
- action
- entity_type
- entity_id
- correlation_id
- user_id (if safe)
- workspace_id
- redaction_status
- message

### Diagnostic bundle
User-facing export should contain:
- application version
- OS information
- enabled feature flags
- redacted logs
- parser warnings
- import summaries
- audit correlation IDs
- optional user-consented failing transaction payload

### Health check screen
Should show:
- app version
- DB health
- storage usage
- pending retention cleanups
- parser package versions
- last successful backup/snapshot later

---

## 6.13 Security Design Notes

### Auth design
- password-based local login
- optional PIN for fast unlock after primary auth has been established
- local session token stored securely

### Recovery flow
- recovery key generated once
- only hash stored
- reset flow invalidates old credentials and emits audit events

### File retention cleanup
Scheduled local cleanup job:
- identifies expired files
- warns user in app before deletion where appropriate
- deletes original file from app-managed storage
- emits FILE_AUTO_DELETED audit event

---

## 6.14 Testing Strategy Deepening

### Unit tests
Required for:
- rules engine
- duplicate detection
- transfer detection
- parser normalization functions
- encryption helpers
- audit event builders

### Component tests
Required for:
- transaction tables
- review queue interactions
- rule editor
- audit timeline UI
- login and unlock screens

### Integration tests
Required for:
- import pipeline end-to-end within backend modules
- DB persistence flows
- account visibility/privacy enforcement
- cleanup job behavior

### Playwright E2E flows
Required happy-path and failure-path coverage for:
- sign up/profile creation
- login and unlock
- statement import
- review queue resolution
- duplicate override
- transaction category edit
- family workspace sharing visibility
- diagnostics export

### Parser golden tests
Each parser must have fixture-based regression tests to prevent accidental parsing drift.

---

## 6.15 Open Design Decisions for the Next Step

These should be converted into implementation-ready detail next:
- exact SQLite library and ORM choice
- encryption approach for sensitive columns
- password/PIN secure storage implementation
- family permission matrix details
- exact transaction/category table columns and indexes
- FTS schema design
- analytics materialization job design
- IPC contract boundaries between Electron main and renderer
- CI pipeline job matrix and reporting format

---

## 6.16 Recommended Immediate Next Deliverables

1. Concrete database schema with table definitions and indexes
2. Permission matrix for profiles, workspaces, and account visibility
3. Parser interface spec and bank adapter contract
4. Review queue UI wireflow
5. GitHub epics expanded into stories and tasks
6. Initial ADR set

This document serves as the **foundation blueprint for SpendStack development** and should evolve as the system grows.

