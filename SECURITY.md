# Security Policy

Security is a top priority for SpendStack.

Because the application handles **sensitive financial information**,
responsible disclosure and secure design are critical.

------------------------------------------------------------------------

## Supported Versions

Since SpendStack is currently under active development, security fixes
will be applied to the latest version.

  Version          Supported
  ---------------- -----------
  Latest           Yes
  Older versions   No

------------------------------------------------------------------------

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public
issue**.

Instead, report it privately.

Preferred method:

Email the maintainer or create a private security advisory through
GitHub.

Include the following information:

-   description of the vulnerability
-   steps to reproduce
-   potential impact
-   suggested mitigation (if known)

------------------------------------------------------------------------

## Responsible Disclosure

Please allow time for the issue to be investigated and resolved before
publicly disclosing details.

Typical process:

1.  Vulnerability reported
2.  Maintainer confirms issue
3.  Fix developed
4.  Security patch released
5.  Public disclosure

------------------------------------------------------------------------

## Security Principles

SpendStack follows several core security principles:

### Local-first data storage

Financial data remains on the user's device by default.

### Minimal data exposure

Sensitive data is not transmitted externally without explicit user
consent.

### Encryption

Sensitive database fields may be encrypted where appropriate.

### Structured logging

Logs are redacted to avoid leaking sensitive financial data.

### Auditability

Key operations generate audit events to ensure transparency.

------------------------------------------------------------------------

## Best Practices for Contributors

When contributing code:

-   avoid logging sensitive information
-   validate all imported data
-   sanitize file inputs
-   follow secure coding practices
-   review dependencies for vulnerabilities

------------------------------------------------------------------------

## Security Goals

SpendStack aims to:

-   minimize attack surface
-   protect financial data
-   provide transparent processing
-   allow independent security review

Security improvements are always welcome through responsible disclosure.
