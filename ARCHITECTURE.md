# SpendStack Architecture

SpendStack follows a **domain‑driven architecture** designed for
modularity and long‑term maintainability.

------------------------------------------------------------------------

## High‑Level Architecture

Electron Desktop App\
│\
▼\
React UI\
│\
▼\
Application Layer\
│\
▼\
Domain Services\
│\
▼\
Infrastructure\
(SQLite / File Storage / Logging)

------------------------------------------------------------------------

## Domain Modules

Core domains include:

Identity\
Workspace\
Statement Import\
Transaction Intelligence\
Audit & Diagnostics\
Insights

------------------------------------------------------------------------

## Data Flow

Statement File\
↓\
Raw Imported Rows\
↓\
Normalized Transactions\
↓\
Categorization Rules\
↓\
Insights & Reporting

------------------------------------------------------------------------

## Repository Structure

spend-stack

apps\
└ desktop

packages\
├ domain\
├ application\
├ infrastructure\
├ ui\
├ importers\
└ shared

.github\
├ workflows\
└ ISSUE_TEMPLATE

docs

------------------------------------------------------------------------

## Database

SQLite is used as the primary database.

Key tables include:

-   user_profiles
-   family_workspaces
-   accounts
-   statement_files
-   import_jobs
-   raw_statement_rows
-   transactions
-   categories
-   categorization_rules
-   review_queue_items
-   audit_events

------------------------------------------------------------------------

## Parser Architecture

Statement imports use **bank adapters**.

Parser Framework\
├ ICICI Adapter\
├ Bank of Baroda Adapter\
└ Kotak Adapter

Adapters convert raw statement formats into a normalized structure.

------------------------------------------------------------------------

## Testing Strategy

SpendStack follows a testing pyramid:

Unit Tests\
Component Tests\
Integration Tests\
End‑to‑End Tests (Playwright)

------------------------------------------------------------------------

## Logging

Structured logging is implemented with:

-   redaction of sensitive data
-   log rotation
-   diagnostics bundles

------------------------------------------------------------------------

## Future Architecture Considerations

Planned future capabilities:

-   Cloud sync (optional)
-   Mobile apps
-   Advanced analytics
-   AI insights with privacy controls
