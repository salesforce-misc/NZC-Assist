---
name: nzc-troubleshoot
description: Diagnoses and resolves common Net Zero Cloud configuration and data issues. Use when the user reports an error, missing data, zero-value footprint, or unexpected behavior in Net Zero Cloud.
---

# Net Zero Cloud Troubleshooter

Diagnose Net Zero Cloud issues by checking the most common root causes in dependency order.

## Diagnostic checklist

1. **License & PSL**
   - Confirm `describe_sobject StnryAssetEnvrSrc` succeeds. If not, nothing else below matters — NZC isn't licensed.
   - Confirm the relevant PSLs are assigned (`NetZeroCloudUserPsl` at minimum; `DataProcessingEnginePsl` for footprint calculation; `TCRMforSustainabilityPsl` for admin/user layering).
2. **Permission sets**
   - PSL assigned but user still can't see data? Check the matching permission set (`NetZeroManager`, `DataProcessingEngineUser`, `TCRMforSustainabilityAdmin`/`User`) — a PSL alone doesn't grant CRUD.
3. **Settings flags**
   - Retrieve `Industries.settings` and confirm the relevant `enableSC*` flag for this domain is on. Some flags are UI-only in some releases — check the Setup path if a metadata deploy reports partial success.
4. **Record types**
   - Are `StnryAssetEnvrSrc`, `VehicleAssetEmssnSrc`, and `BldgEnrgyIntensity` record types deployed? A source can't be meaningfully created without one.
5. **Reference data completeness**
   - Run `/nzc:audit reference-data`. A "zero footprint" symptom is almost always a factor-set load gap, not a calculation bug.
6. **Data integrity**
   - Run `/nzc:audit data-integrity`. Look specifically for null `AnnualEmssnInventoryId` on any footprint object — that's the single most common integrity failure.
7. **Load order violations**
   - Was energy/activity use loaded before its source? Was a Scope 3 procurement source created before its supplier? Both produce orphaned or zero-value records that pass a naive smoke test.
8. **Bulk load failures**
   - For any tier over ~200 rows, confirm Bulk API 2.0 (`bulk_upsert_records`) was used, and check **per-row** job results — a job can report "complete" with partial row failures.
9. **API-name drift**
   - Did a query or CSV header reference a cached object/field name from a previous release? Re-run `describe_sobject` — Net Zero Cloud names are not guaranteed stable across releases.
10. **Production-write refusal**
    - Is a write being unexpectedly blocked? Confirm whether the target org is production-type (`isSandbox:false`) — this plugin refuses bulk/destructive writes there by default until explicitly confirmed. This is a safety feature, not a bug.

## Frequent symptoms

| Symptom | Likely cause |
|---|---|
| `describe_sobject StnryAssetEnvrSrc` fails | NZC not licensed — see `nzc-foundation-licensing` |
| Settings deploy reports partial success | One or more `enableSC*` flags are UI-only this release |
| Record-type deploy fails/blocked | Live source data already references the record type being changed — reassign records first |
| `sf org assign permsetlicense` succeeds but feature still invisible | `DeveloperName` didn't match this org's actual PSL name — confirm via SOQL, don't trust the design-time name; fall back to anonymous-Apex `PermissionSetLicenseAssign` insert if the CLI path is unavailable |
| Footprint calculates to zero | Reference/factor data load didn't complete before energy-use data was loaded |
| Footprint missing / fails a validation rule | `AnnualEmssnInventoryId` is null — footprint was created without the annual inventory link |
| Bulk load "succeeded" but counts are short | Bulk API 2.0 job had partial row failures — check per-row results, not just job status |
| Teardown has nothing to reverse | Sample data was scaffolded without recording a fixture manifest |
| Write refused unexpectedly | Target org is production-type; refusal is by design — confirm explicitly if the write is really intended |
| SOQL query errors on a metadata entity | Record types / `*Config` / Industries settings are metadata, not data — use `deploy_metadata`/`retrieve_metadata`, never `run_soql` |
| A query that worked last release now errors | API-name drift — re-run `describe_sobject` against the current org/release before assuming the plugin's design-time name is still correct |

## Tools to use

- `health_check` — full org diagnostic
- `audit_nzc_config` — validation rules against the org
- `diagnose_nzc_issue <error message>` — keyword search across the validation rule set
- `run_soql` / `describe_sobject` — confirm data and field names directly

## Output

When troubleshooting, return:

1. The most likely cause first.
2. The diagnostic command run.
3. The exact remediation step (Setup path, PSL/permission set to assign, load order to fix).
4. Any irreversible-step warnings before applying a fix.

## See also

`knowledge/troubleshooting/common-issues.md` · `nzc-testing-validation` skill · `nzc-sdet` agent.
