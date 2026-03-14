# SpendStack

SpendStack is a **local-first personal and family finance desktop
application** designed to give users full control of their financial
data while still providing powerful organization and insights.

Unlike cloud-first finance tools, SpendStack prioritizes **privacy,
transparency, and ownership**. Your financial data stays on your device
unless you explicitly choose otherwise.

------------------------------------------------------------------------

## Core Philosophy

Your financial data belongs to you.

SpendStack is designed so that:

-   Your financial data stays **local**
-   Imports are **transparent**
-   Every transaction is **traceable**
-   Privacy is **built into the architecture**
-   AI insights are **opt-in and consent based**

------------------------------------------------------------------------

## Key Features

### Local‑First Architecture

All financial data is stored locally on your device.

Benefits: - Full privacy - Faster performance - Offline usage - No
dependency on third‑party aggregators

------------------------------------------------------------------------

### Multi‑User Support

SpendStack supports **multiple user profiles on the same device**.

Each user can:

-   Maintain personal accounts
-   Participate in shared family workspaces
-   Control visibility of their financial data

------------------------------------------------------------------------

### Family Workspace

SpendStack allows family members to collaborate while still maintaining
privacy.

Example structure:

Family Workspace\
├── Parent\
│ ├── Personal Accounts\
│ └── Shared Household Accounts\
│\
├── Partner\
│ ├── Personal Accounts\
│ └── Shared Household Accounts\
│\
└── Child\
└── Limited visibility

------------------------------------------------------------------------

### Bank Statement Imports

SpendStack focuses on **statement‑based imports**.

Supported formats:

-   PDF\
-   CSV\
-   XLSX

Initial bank support:

-   ICICI Bank\
-   Bank of Baroda\
-   Kotak Mahindra Bank

Import pipeline includes:

-   Parser framework
-   Duplicate detection
-   Review queue
-   Traceability to source rows

------------------------------------------------------------------------

### Transaction Intelligence

SpendStack processes imported rows into meaningful financial
transactions.

Features:

-   Normalized transaction model
-   Duplicate detection
-   Own‑account transfer detection
-   Rule‑based categorization
-   Low‑confidence review queue

------------------------------------------------------------------------

### Full Audit Trail

Every transaction can be traced back to its origin.

Statement File\
↓\
Raw Imported Rows\
↓\
Normalized Transactions\
↓\
Categorization\
↓\
Insights

------------------------------------------------------------------------

### Statement File Lifecycle

Imported statements are stored temporarily.

-   Files kept for **7 days**
-   Automatically deleted afterward
-   Normalized transaction records remain
-   Users receive notifications about cleanup

------------------------------------------------------------------------

## Technology Stack

Core technologies:

-   Electron
-   React
-   TypeScript
-   SQLite

Development tooling:

-   npm workspaces
-   GitHub Actions
-   ESLint
-   Prettier
-   Playwright (E2E testing)

------------------------------------------------------------------------

## Development Roadmap

v1.0 -- Core statement import system\
v1.1 -- Budgeting & export tools\
v1.2 -- Localization\
v1.5 -- Optional cloud sync

------------------------------------------------------------------------

## Security Principles

SpendStack follows strict security principles:

-   Local‑first storage
-   Encryption for sensitive fields
-   Structured logging with redaction
-   Full audit trail
-   Explicit consent for AI insights

------------------------------------------------------------------------

## License

MIT License
