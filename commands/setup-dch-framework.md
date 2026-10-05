---
description: Set up a single Disclosure & Compliance Hub framework (gri, esrs, cdp or sasb) on the connected org
---

# Set Up a DCH Framework

Installs one framework package, deploys its OmniStudio resources and layouts, and uploads and links its Word report templates.

$ARGUMENTS

## Steps

1. Take the framework from `$ARGUMENTS` (`gri`, `esrs`, `cdp` or `sasb`); if missing or unrecognized, ask once.
2. Call `dch_status`. If the OmniStudio package or DocGen foundation is missing, run `/nzc:setup-dch` scope "foundation" first — frameworks depend on it.
3. Confirm the org is non-production and get explicit confirmation of the alias.
4. Call `setup_dch_framework` with the framework and `confirm: true` (optionally `packageVersion` to override the pinned version).
5. Report each step as `ok` / `skipped` / `failed`. On failure, consult the `nzc-dch` skill's failure-mode table.
