# Security policy

Thanks for helping keep Idswyft and its users safe. This document explains how to
report a vulnerability privately.

## Reporting a vulnerability

**Do not open a public issue for security problems.** Use one of these private
channels instead:

- **GitHub private vulnerability reporting** (preferred): on the
  [community repository](https://github.com/team-idswyft/idswyft-community),
  open the **Security** tab and choose **Report a vulnerability**. Reports go
  straight to the maintainers and stay private.
- **Email**: [team@idswyft.app](mailto:team@idswyft.app).

Please include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- Affected version or commit, and your deployment mode (self-hosted or cloud).
- Any suggested fix, if you have one.

## What to expect

- We acknowledge new reports within **3 business days**.
- We confirm the issue and share a remediation plan, then keep you updated as we
  work through it.
- We credit reporters in the release notes unless you ask us not to.

Please give us reasonable time to ship a fix before any public disclosure.

## Supported versions

Idswyft ships as a rolling release. We patch security issues on the **latest
released version**. Self-hosters should track the newest tag before reporting, in
case the issue is already fixed.

## Scope

This policy covers the Idswyft codebase in this repository: the backend API, the
verification engine, the frontend, and the JavaScript SDK. Vulnerabilities in
third-party dependencies should be reported to the upstream project; tell us too
if they affect an Idswyft deployment.
