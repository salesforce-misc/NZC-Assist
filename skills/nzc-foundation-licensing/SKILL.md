---
name: nzc-foundation-licensing
description: Net Zero Cloud / Data Processing Engine / TCRM-for-Sustainability licenses, permission set licenses, permission sets, and Industries/Sustainability settings — the mandatory foundation every other Net Zero Cloud domain depends on. Use when the user asks about Net Zero Cloud licensing, permission set licenses (PSLs), permission sets, or why NZC objects/settings aren't visible in an org.
---

# Net Zero Cloud Foundation & Licensing Expert

Net Zero Cloud objects and settings fields **do not exist** in an org without the license provisioned — this is the mandatory first gate for everything else in this plugin (`JOURNEY_MAP.md` Part 2, steps 1-4).

## The three-tier foundation

| Tier | What it is | Names (design-time — confirm via SOQL) |
|---|---|---|
| 1. License | Provisioned by Salesforce; no self-service path either direction | Detect via `describe_sobject StnryAssetEnvrSrc` |
| 2. Permission Set Licenses (PSLs) | Gate feature visibility org-wide | `NetZeroCloudUserPsl`, `DataProcessingEnginePsl`, `TCRMforSustainabilityPsl` |
| 3. Permission sets | Object/field-level CRUD layered on top of PSLs | `NetZeroManager`, `DataProcessingEngineUser`, `TCRMforSustainabilityAdmin`, `TCRMforSustainabilityUser` |

**A PSL alone does not grant CRUD.** A user can have the `NetZeroCloudUserPsl` and still see nothing without the matching permission set.

## Detection sequence

1. `describe_sobject StnryAssetEnvrSrc` — if this fails, **stop and report**. Nothing below is reachable in an unlicensed org.
2. `SELECT DeveloperName FROM PermissionSetLicense WHERE DeveloperName LIKE '%NetZero%' OR DeveloperName LIKE '%Sustainability%'` — confirms which PSLs actually exist in this org (names can vary by release — never assume the design-time names above are exact).
3. `SELECT AssigneeId, PermissionSetLicense.DeveloperName FROM PermissionSetLicenseAssign WHERE PermissionSetLicense.DeveloperName = '<confirmed name>'` — confirms assignment coverage.

## Assignment mechanics

- **Primary path**: `sf org assign permsetlicense --name <DeveloperName> --target-org <alias>` (via `assign_permset_license`).
- **Fallback**: `PermissionSetLicenseAssign` isn't normal CRUD-friendly — if the CLI path fails, fall back to an anonymous-Apex insert (`run_apex`) of a `PermissionSetLicenseAssign` record. Confirm the exact `DeveloperName` via SOQL first; a mismatched name is a **silent no-op**, not an error.
- Permission sets: `sf org assign permset --name <API name>` (via `assign_permset`).

## Industries / Sustainability settings

Once licensed, org-wide feature flags in `Industries.settings` (`enableSC*`) gate which NZC domains are active — stationary assets, vehicle assets, waste, water, Scope 3 procurement, Scope 3 travel. See `JOURNEY_MAP.md` Part 2 step 4.

- These are **metadata, not data** — deploy via `deploy_metadata` against `metadata/settings/`, never `run_soql`.
- **Most flags are one-way once turned on.** Treat every enablement as a confirm-first action.
- Not every flag is guaranteed deployable via metadata in every release — some may be UI-only. After deploying, report which flags succeeded and which need a manual Setup path (`/nzc:enable-net-zero` does this automatically).

## Common failure modes

| Symptom | Likely cause |
|---|---|
| `describe_sobject StnryAssetEnvrSrc` fails | NZC not licensed — file a request with Salesforce, this cannot be self-service enabled |
| User has the PSL but sees no NZC data | Missing the matching permission set (PSL ≠ CRUD) |
| `sf org assign permsetlicense` succeeds but user still can't see the feature | `DeveloperName` didn't match this org's actual PSL name — confirm via SOQL, don't trust the design-time name |
| Settings deploy reports partial success | One or more `enableSC*` flags are UI-only in this release — surface the Setup path for the rest |
| Footprint calculation fails for a user | Missing `DataProcessingEnginePsl` — DPE-driven footprint jobs need it |

## Tools to use

- `describe_sobject` — the license probe
- `run_soql` — confirm PSL/permission-set names and assignment coverage
- `assign_permset_license` / `assign_permset` / `list_permission_sets`
- `deploy_metadata` — Industries/Sustainability settings
- `run_apex` — PSL-assignment fallback

## See also

`JOURNEY_MAP.md` Part 2 steps 1-4 · `knowledge/modules/settings/README.md` · `knowledge/validation-rules/foundation.yaml` · `nzc-data-model` skill.
