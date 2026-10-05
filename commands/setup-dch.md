---
description: Set up Disclosure & Compliance Hub (OmniStudio/DocGen foundation plus GRI, ESRS, CDP and SASB frameworks) on the connected org
---

# Set Up Disclosure & Compliance Hub

Installs and configures DCH end to end, or a single part of it.

$ARGUMENTS

## Steps

1. Confirm the target org is selected and non-production (a scratch org from `create_scratch_org` with `definitionFile: "dch"` is ideal). If it is production-type, stop and recommend a scratch org or sandbox — package installs are hard to reverse.
2. Call `dch_status` to show what is already installed and linked.
3. Ask the user once which scope they want: everything (`setup_dch`), the foundation only (`setup_dch_foundation`), or specific frameworks (`setup_dch_framework` with `gri` / `esrs` / `cdp` / `sasb`). If `$ARGUMENTS` already names one, don't ask.
4. Mention that package versions default to the pinned DCH versions and can be overridden, and that the DocGen sample packs need the `vlocity` CLI (`npm install -g vlocity`) or that step is skipped.
5. Get explicit confirmation of the org alias, then call the chosen tool with `confirm: true`.
6. Report the step list verbatim: what was `ok`, `skipped` (with the reason) and `failed`. On failure, read the `nzc-dch` skill's failure-mode table before suggesting a fix.
7. Finish with `dch_status` to show the final state.
