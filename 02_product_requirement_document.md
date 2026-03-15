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

This document serves as the **foundation blueprint for SpendStack development** and should evolve as the system grows.

