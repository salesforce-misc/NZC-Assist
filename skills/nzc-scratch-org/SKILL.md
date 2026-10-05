---
name: nzc-scratch-org
description: Creating and tearing down disposable, non-production Net Zero Cloud scratch orgs for testing — the safe alternative to running any write tool against a production org. Use when the user wants to test NZC-Assist, needs a throwaway org, asks how to set up a scratch org, or when any write tool has refused because the connected org is production-type.
---

# Net Zero Cloud Scratch Org Expert

A scratch org is the only org type every write tool in this plugin treats as safe-by-default (`isProductionOrg` returns `false` for scratch orgs and sandboxes — see `src/salesforce/auth.ts`). When a user hits a `confirmProductionWrite` refusal, or wants to try `/nzc:scaffold-sample-data` / `/nzc:calculate-footprints` without any risk to a real org, creating a scratch org is the answer — not setting `confirmProductionWrite: true` against their production org.

## Prerequisites

1. **A DevHub-enabled org authenticated as a DevHub.** Check with `list_sf_orgs` (or `sf org list --json`) for a non-empty `devHubs` array. If none exists:
   ```
   sf org login web --set-default-dev-hub --alias <alias>
   ```
2. **For Disclosure & Compliance Hub, pass `definitionFile: "dch"`** to `create_scratch_org` — it uses `config/dch-scratch-def.json` (adds OmniStudio, DocGen, Clause Management, Disclosure Framework); see the `nzc-dch` skill.
3. **This plugin's `config/project-scratch-def.json`** — already committed, no setup needed. It bakes Net Zero Cloud licensing into the org **at creation time**:
   ```json
   {
     "features": ["EnableSetPasswordInApi", "SustainabilityApp", "RecordTypes"],
     "settings": {
       "industriesSettings": {
         "enableSustainabilityCloud": true,
         "enableSCCarbonAccounting": true,
         "enableSCSNGManagement": true
       }
     }
   }
   ```
   This is a **different enablement path** than `enable_net_zero_settings` (which deploys `metadata/settings/Industries.settings` as a post-creation MDAPI deploy against an org that already exists). For a scratch org, the scratch-def gets you there in one step; `enable_net_zero_settings` is still what you use against an already-existing sandbox/production org.

## Creating one

Use `create_scratch_org` (requires `confirm: true` — this is a real DevHub operation that consumes org-creation quota, so confirm the alias and which DevHub with the user first if more than one is authenticated, per `CLAUDE.md`'s Org Selection rules):

```
create_scratch_org({ alias: "nzc-test-1", confirm: true })
```

This creates the org, sets it as the target org, and runs the license probe (`describe_sobject StnryAssetEnvrSrc`) to confirm licensing actually landed — report `licenseProbe.provisioned` either way. It does **not** assign PSLs/permission sets or deploy any other metadata; chain the normal setup sequence afterward exactly as you would for any other org:

`/nzc:assign-permissions` → `/nzc:enable-net-zero` (idempotent even though the scratch-def already set the flags — it verifies and reports) → `/nzc:configure-record-types` → `/nzc:load-reference-data` → `/nzc:scaffold-sample-data` → …

## PSL / permission set names — verify, don't trust the design-time list

`JOURNEY_MAP.md` and the `nzc-foundation-licensing` skill document `TCRMforSustainabilityPsl` / `TCRMforSustainabilityAdmin` / `TCRMforSustainabilityUser` as part of the foundation. **A scratch org created from this plugin's scratch-def (via the `SustainabilityApp` feature) does not provision those** — confirmed by live `SELECT DeveloperName FROM PermissionSetLicense` / `PermissionSet` queries against such an org. What it actually provisions:

| Kind | Live-verified names (scratch org, `SustainabilityApp` feature) |
|---|---|
| PSLs | `NetZeroCloudUserPsl`, `DataProcessingEnginePsl`, `ManufacturingAdvancedAccountForecastPsl`, `EinsteinNetZeroCloudPsl` |
| Permission sets | `NetZeroManager`, `NetZeroAdmin`, `NetZeroAuditor`, `DataProcessingEngineUser`, `EinsteinNetZeroCloudUser` |

TCRM-for-Sustainability may still be real for fully-provisioned production/sandbox orgs (Salesforce licenses can be bundled differently there) — this is not a claim that TCRM doesn't exist anywhere, only that this scratch-org path doesn't grant it. Either way, **always re-confirm names via SOQL** (`run_soql`) against the actual connected org before assigning — don't assume either list is exact for a given org.

## Lifecycle gotchas

- Scratch orgs **expire** (`durationDays`, default 7, max 30 — pass a larger value for anything you want to keep around for a multi-day test pass). An expired org simply stops being usable; there's no renewal, only re-creating.
- Each DevHub has a scratch-org quota. Delete orgs you're done with (`delete_scratch_org`, also `confirm: true`) rather than letting them expire, so quota frees up immediately for the next run.
- Multiple DevHubs may be authenticated on one machine. Pass `devHub` explicitly when it matters which one is used; otherwise `sf`'s configured default DevHub is used.
- A freshly created scratch org has **no reference/factor data and no record types/`*Config` metadata** — the scratch-def only buys you the license + settings flags. The rest of the setup sequence (`JOURNEY_MAP.md` Part 2, steps 5+) still applies in full.

## Tools to use

- `list_sf_orgs` — check for an authenticated DevHub
- `create_scratch_org` / `delete_scratch_org`
- `describe_sobject` — the license probe this tool already runs internally; re-run it yourself any time to double check
- `run_soql` — confirm actual PSL/permission-set `DeveloperName`s before assigning
- Everything downstream is unchanged: `assign_permset[_license]`, `enable_net_zero_settings`, `deploy_metadata`, `load_reference_data`, `scaffold_sample_data`, `calculate_footprints`

## See also

`nzc-foundation-licensing` skill · `JOURNEY_MAP.md` Part 2 · `/nzc:create-scratch-org` command.
