---
description: Run Net Zero Cloud configuration and data-integrity validation rules
---

# Audit Net Zero Cloud Configuration

Run the validation-rule suite against the connected org and report pass/fail/warn per rule.

$ARGUMENTS

## Steps

1. If a group was provided in arguments (`foundation`, `reference-data`, `data-integrity`, or `all`) → run that group. Otherwise call `list_validation_groups` and ask, or default to `all`.
2. Call `audit_nzc_config` with the chosen group(s).
3. Render results grouped by severity: errors first, then warnings, then info/passed.
4. For each failed rule, show its `remediation` text and `docs` pointer if present in the rule definition — don't paraphrase around a missing remediation, just say none is defined and route to `/nzc:help` or `nzc-troubleshoot`.
5. If a rule's `check.type` is `soql` and it fails, show the actual query and count so the user can verify it themselves.
6. Close with a one-line overall status (e.g., "12 passed, 1 warning, 0 errors") and, if anything failed, offer to run `diagnose_nzc_issue` for a deeper look.
