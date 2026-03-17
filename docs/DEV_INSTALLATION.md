# SpendStack — Dev Installation & Troubleshooting Guide

This guide walks you through setting up a local SpendStack development
environment from scratch, explains how the `overrides` field in
`package.json` works, and provides a reference for common issues you
may encounter.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone the Repository](#2-clone-the-repository)
3. [Install Dependencies](#3-install-dependencies)
4. [Run the Desktop App in Development Mode](#4-run-the-desktop-app-in-development-mode)
5. [Build All Packages](#5-build-all-packages)
6. [Run Tests](#6-run-tests)
7. [Type-Checking](#7-type-checking)
8. [Code Quality: Lint and Format](#8-code-quality-lint-and-format)
9. [npm `overrides` — What They Are and Why We Use Them](#9-npm-overrides--what-they-are-and-why-we-use-them)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

Install the following tools before cloning the repository.

| Tool    | Required Version | Notes                                      |
| ------- | ---------------- | ------------------------------------------ |
| Node.js | `>= 22.0.0`      | [nodejs.org/en/download](https://nodejs.org/en/download/) |
| npm     | `>= 10.0.0`      | Comes bundled with Node.js 22              |
| Git     | any modern       | [git-scm.com](https://git-scm.com/)        |

### Verify your versions

```bash
node --version   # should print v22.x.x or higher
npm --version    # should print 10.x.x or higher
git --version    # should print git version X.Y.Z or higher
```

> **Why Node.js 22?**  
> The root `package.json` sets `"engines": { "node": ">=22.0.0" }` and
> the `.npmrc` sets `engine-strict=true`, which means npm will refuse to
> install if your Node.js version is older than 22.

---

## 2. Clone the Repository

```bash
git clone https://github.com/omprakash201194/spend-stack.git
cd spend-stack
```

---

## 3. Install Dependencies

SpendStack is an **npm workspaces monorepo**. A single command at the
repository root installs every workspace dependency:

```bash
npm install
```

`npm install` reads `package.json`, `package-lock.json`, and the
`overrides` field to resolve the full dependency tree across all
workspaces (`apps/*` and `packages/*`).

### Use `npm ci` for reproducible installs

When you want a byte-for-byte reproduction of what CI uses (recommended
before running tests or creating a build):

```bash
npm ci
```

`npm ci` deletes `node_modules` first and installs exactly what is
recorded in `package-lock.json`, including all override resolutions.

---

## 4. Run the Desktop App in Development Mode

```bash
npm run dev
```

This starts the Vite dev server together with the Electron main
process.  
The desktop window opens automatically.

The script is a shortcut for:

```bash
npm run dev -w apps/desktop
```

### What the dev server does

- Vite serves the React renderer with Hot Module Replacement (HMR).
- `vite-plugin-electron` spawns the Electron main process and watches
  `electron/main.ts` for changes.
- Changes to renderer code reload the UI in-place; changes to the main
  process restart Electron.

---

## 5. Build All Packages

```bash
npm run build
```

This runs `tsc` (TypeScript compiler) in every workspace that exposes a
`build` script:

| Workspace                         | Output       |
| --------------------------------- | ------------ |
| `apps/desktop`                    | `dist/` and `dist-electron/` |
| `packages/database`               | `dist/`      |
| `packages/parser-engine`          | `dist/`      |
| `packages/shared`                 | `dist/`      |
| `packages/transaction-intelligence` | `dist/`    |
| `packages/ui`                     | `dist/`      |

To build a single workspace:

```bash
npm run build -w packages/parser-engine
```

To clean all build output:

```bash
npm run clean
```

---

## 6. Run Tests

### All workspaces

```bash
npm run test
```

### A specific workspace

```bash
npm run test -w packages/parser-engine
npm run test -w packages/shared
npm run test -w packages/transaction-intelligence
```

### Watch mode (re-runs on file save)

```bash
npm run test:watch -w packages/parser-engine
```

### Coverage report

```bash
npm run test:coverage -w packages/parser-engine
```

The coverage HTML report is written to `packages/parser-engine/coverage/`.

SpendStack uses **Vitest**, which is declared as a root `devDependency`
and resolved via npm workspaces — there is no need to install Vitest
separately in each package.

---

## 7. Type-Checking

```bash
npm run typecheck
```

This runs `tsc --noEmit` across all workspaces. No JavaScript output is
produced; only type errors are reported.

To type-check a single workspace:

```bash
npm run typecheck -w apps/desktop
```

---

## 8. Code Quality: Lint and Format

### Lint

```bash
npm run lint
```

ESLint is configured in `eslint.config.js` at the repository root.
TypeScript rules enforce:

- No unused variables (prefix with `_` to mark as intentionally unused)
- No explicit `any` (warning)
- Consistent type-only imports (`import type { … }`)

### Auto-fix lint issues

```bash
npm run lint -- --fix
```

### Format with Prettier

Check only (no writes):

```bash
npm run format:check
```

Apply formatting:

```bash
npm run format
```

Prettier settings are in `.prettierrc.json`:
single quotes, semicolons, trailing commas, 100-character print width.

---

## 9. npm `overrides` — What They Are and Why We Use Them

### What is the `overrides` field?

The `overrides` field in `package.json` forces npm to replace a
transitive dependency with a specific version, regardless of what the
intermediate package requests.  
It is the npm equivalent of Yarn's `resolutions` field.

```json
"overrides": {
  "some-package": "x.y.z"
}
```

This tells npm: *"No matter which version of `some-package` any
dependency tree requests, always install `x.y.z`."*

### Overrides in this project

The root `package.json` currently defines two overrides:

```json
"overrides": {
  "glob": "^13.0.0",
  "global-agent": "4.1.3"
}
```

#### `glob` → `^13.0.0`

`@vitest/coverage-v8` pulls in `test-exclude`, which in turn requires
`glob@^10`. Older `glob` versions (≤10.x) are deprecated and contain
publicized security vulnerabilities. The override forces the entire
dependency tree to use `glob@13`, which is the current, actively
maintained release and is compatible with Node.js 20 and 22.

#### `global-agent` → `4.1.3`

`electron` depends on `@electron/get`, which lists `global-agent@^3`
as an optional dependency (used for corporate proxy support). Version 3
of `global-agent` depended on the `boolean` package, which is no longer
maintained (`boolean@3.2.0` — deprecated). The override pins
`global-agent` to version 4, which dropped the `boolean` dependency
entirely while keeping the same public API (`bootstrap()`).

### Adding or updating an override

1. Open the root `package.json`.
2. Add or update the entry in `"overrides"`:

   ```json
   "overrides": {
     "some-vulnerable-package": "^safe-version"
   }
   ```

3. Regenerate the lock file:

   ```bash
   npm install
   ```

4. Verify the installed version:

   ```bash
   npm ls some-vulnerable-package
   ```

5. Commit both `package.json` and `package-lock.json`.

> **Caution:** Overrides bypass semver compatibility guarantees. Always
> test the application after changing an override.

### Nested overrides

To override a package only when it is installed as a dependency of a
specific parent, use a nested override:

```json
"overrides": {
  "parent-package": {
    "child-package": "^new-version"
  }
}
```

---

## 10. Troubleshooting

### `npm error RequestError: unable to get local issuer certificate`

**Symptom**  
`npm install` (or `npm ci`) fails with a TLS/SSL certificate error,
typically during the Electron binary download on corporate networks.

**Cause**  
Corporate firewalls often use a custom root CA for HTTPS inspection.
Node.js / npm does not trust the custom CA by default.

**Fix — preferred (add the corporate CA)**

1. Export your corporate root CA as a `.pem` file (ask your IT team).
2. Set the `NODE_EXTRA_CA_CERTS` environment variable:

   ```bash
   # macOS / Linux
   export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem
   npm install

   # Windows (PowerShell)
   $env:NODE_EXTRA_CA_CERTS = "C:\certs\corporate-ca.pem"
   npm install
   ```

3. Add the variable permanently to your shell profile or system
   environment variables.

**Fix — alternative (disable strict SSL, use with caution)**

```bash
npm config set strict-ssl false
npm install
npm config set strict-ssl true   # re-enable after install
```

> ⚠️ Disabling SSL verification is a security risk. Only use it as a
> last resort on a trusted private network and re-enable it immediately.

---

### `EBUSY: resource busy or locked` on Windows

**Symptom**

```
npm warn cleanup Failed to remove some directories [
  ['\\?\C:\...\node_modules\esbuild', [Error: EBUSY …]]
]
```

**Cause**  
Windows file locking prevents npm from replacing certain binaries (e.g.
`esbuild`, `electron`) while they are in use.

**Fix**

1. Close all editors, terminals, and any process that may have loaded
   files from `node_modules` (VS Code, Windows Explorer preview, etc.).
2. If the issue persists, delete `node_modules` manually and reinstall:

   ```powershell
   Remove-Item -Recurse -Force .\node_modules
   npm install
   ```

3. As a last resort, restart Windows and run `npm install` before
   opening any editor.

---

### Deprecated package warnings during `npm install`

**Symptom**

```
npm warn deprecated boolean@3.2.0: Package no longer supported.
npm warn deprecated glob@10.5.0: Old versions of glob are not supported …
```

**Cause**  
These packages are transitive dependencies (pulled in by `electron` and
`@vitest/coverage-v8`). We cannot update them in their own
`package.json`, but we can use npm `overrides`.

**Fix**  
These warnings are already resolved by the `overrides` field in the
root `package.json`. If you see them after a clean install, verify that
`package.json` contains:

```json
"overrides": {
  "glob": "^13.0.0",
  "global-agent": "4.1.3"
}
```

Then delete `node_modules` and `package-lock.json` and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

---

### `npm error code EBADENGINE` — Node.js version mismatch

**Symptom**

```
npm error code EBADENGINE
npm error notsup Unsupported engine { required: { node: '>=22.0.0' }, current: { node: 'v18.x.x' } }
```

**Cause**  
The `.npmrc` file sets `engine-strict=true`. npm enforces the `engines`
field in `package.json`, which requires Node.js ≥ 22.

**Fix**  
Install Node.js 22 or later. We recommend using a version manager:

- [nvm](https://github.com/nvm-sh/nvm) (macOS / Linux):

  ```bash
  nvm install 22
  nvm use 22
  ```

- [nvm-windows](https://github.com/coreybutler/nvm-windows) (Windows):

  ```powershell
  nvm install 22
  nvm use 22
  ```

- [fnm](https://github.com/Schniz/fnm) (cross-platform, fast):

  ```bash
  fnm install 22
  fnm use 22
  ```

---

### `Cannot find module` or `ERR_MODULE_NOT_FOUND`

**Symptom**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '@spendstack/shared'
```

**Cause**  
`node_modules` is incomplete or missing — often after switching branches
or pulling new commits that added workspace packages.

**Fix**

```bash
npm install
```

If the error persists after `npm install`, try a clean reinstall:

```bash
rm -rf node_modules
npm install
```

---

### Lint errors: `no-unused-vars`

**Symptom**

```
error  'someVar' is assigned a value but never used  @typescript-eslint/no-unused-vars
```

**Fix**  
Prefix any intentionally unused variable or function argument with `_`
(underscore). The ESLint config ignores names matching `^_`:

```ts
// Before — lint error
const { passwordHash, ...rest } = profile;

// After — no error
const { passwordHash: _passwordHash, ...rest } = profile;
```

---

### Stale `package-lock.json` after merging branches

**Symptom**  
`npm ci` fails or produces errors after merging a branch that modified
`package.json` or `package-lock.json`.

**Fix**  
Resolve any merge conflicts in `package-lock.json`, then regenerate it:

```bash
rm package-lock.json
npm install         # regenerates package-lock.json
git add package-lock.json
```

Alternatively, accept one side of the merge conflict and run
`npm install` to let npm reconcile the tree automatically.

---

### Electron window does not open in dev mode

**Symptom**  
`npm run dev` starts but no Electron window appears.

**Common causes and fixes**

| Cause | Fix |
| --- | --- |
| Electron binary was not downloaded (network issue at install time) | Run `npm install` again with a working internet connection |
| Port already in use | Kill the process on the default Vite port (`5173`) or change it in `vite.config.ts` |
| Electron crashed silently | Check the terminal output for a stack trace |

---

### TypeScript errors after updating dependencies

**Symptom**  
`npm run typecheck` or `npm run build` reports unexpected type errors
after updating `package.json`.

**Fix**

1. Delete stale build info files:

   ```bash
   find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete
   ```

2. Re-run the type-check:

   ```bash
   npm run typecheck
   ```

---

## Getting Help

- Review open and closed
  [GitHub Issues](https://github.com/omprakash201194/spend-stack/issues)
  before opening a new one.
- When reporting a bug, include your OS, Node.js version (`node -v`),
  npm version (`npm -v`), and the full error output.
- For contribution guidelines see [CONTRIBUTING.md](../CONTRIBUTING.md).
