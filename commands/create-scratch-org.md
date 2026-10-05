---
description: Create a disposable, non-production scratch org pre-licensed for Net Zero Cloud
---

# Create a Net Zero Cloud Scratch Org

Spin up a throwaway org to test against — the safe alternative to running any write tool against a production org.

$ARGUMENTS

## Steps

1. Call `list_sf_orgs` and check for a non-empty `devHubs` array. If none is authenticated, stop and tell the user to run `sf org login web --set-default-dev-hub --alias <alias>` first — this cannot proceed without one.
2. If more than one DevHub is authenticated, ask the user once which to use (per `CLAUDE.md`'s Org Selection rules — don't ask again after they answer).
3. Confirm an alias for the new org with the user (suggest one like `nzc-test-<date>` if they haven't named one) and how long it should last (`durationDays`, default 7, max 30).
4. Explicitly confirm with the user that creating this org is OK — it's a real DevHub operation that consumes scratch-org quota — then call `create_scratch_org` with `confirm: true`.
5. Report the result, including `licenseProbe.provisioned`. If `false`, surface the detail message — don't silently retry or assume success.
6. On success, the new org is now the target org. Suggest the next steps: `/nzc:assign-permissions` → `/nzc:configure-record-types` → `/nzc:load-reference-data` → `/nzc:scaffold-sample-data`.
7. Remind the user it will expire after `durationDays`, and that `delete_scratch_org` (also `confirm: true`) frees the DevHub quota slot immediately once they're done, rather than waiting on expiry.
