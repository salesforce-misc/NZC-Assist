# Net Zero Cloud — Common Issues

| Issue | Likely cause | Fix |
|---|---|---|
| `describe_sobject StnryAssetEnvrSrc` fails | NZC license not provisioned for this org | Stop — file a license request with Salesforce; do not attempt settings/data work until this succeeds |
| Settings deploy reports success but a flag is still off in Setup | That specific `enableSC*` flag is UI-only in this release, or requires a page refresh / cache clear | Report the flag + Setup path to the user; toggle it manually in Setup → Industries Settings |
| Record type deploy fails with "Cannot delete/deactivate record type" | The record type is already referenced by live source data | Reassign existing records to another record type first, or add rather than replace |
| Permission set license assignment silently no-ops | `sf org assign permsetlicense` used a `DeveloperName` that doesn't match this org's actual PSL name | Confirm exact name via `SELECT DeveloperName FROM PermissionSetLicense WHERE ...` before assigning; fall back to the anonymous-Apex `PermissionSetLicenseAssign` insert |
| Reference data import fails partway through | `sf data import tree` plan references a `referenceId` before it's defined, or a factor-set parent didn't load first | Re-check `data/reference/reference-load-order.json`; load strictly in that order |
| Energy-use or activity record loads but footprint calc produces zero | The matching factor set/item wasn't loaded before the use record, or the UOM doesn't convert cleanly to what the factor expects | Verify the factor set exists and covers this fuel/energy/waste type; verify UOM conversion |
| Footprint record fails validation / audit flags it | `AnnualEmssnInventoryId` is null, or points to the wrong fiscal year | Create/verify the annual inventory first (`/nzc:build-annual-inventory`); always set the lookup when creating a footprint |
| Bulk load of large sample-data tiers (air travel, hotel, rental car, procurement) times out or partially fails | Bulk API 2.0 job exceeded a per-batch limit, or a governor/validation-rule rejection on a subset of rows | Chunk the CSV, poll the job, and inspect partial-failure results before retrying only the failed rows |
| Scaffolded sample data can't be torn down cleanly | No fixture manifest was recorded when the data was created | Always record created IDs to a fixture manifest during `/nzc:scaffold-sample-data`; teardown deletes in reverse dependency order |
| A write command aborts asking for confirmation against an org you expected to be a sandbox | The connected org is production-type (`isSandbox:false`) — the plugin refuses destructive/bulk writes by default | Confirm explicitly if this is intentional, or connect to a sandbox/scratch org instead |
| SOQL against a record type, `*Config`, or settings value returns nothing or errors | These are metadata/Tooling API entities, not queryable via plain `run_soql` | Use `deploy_metadata`/`retrieve_metadata` or the Tooling API path instead — see `CLAUDE.md` § "Tooling-API / metadata entities" |
| A previously-working SOQL query or CSV header suddenly errors after a Salesforce release upgrade | Net Zero Cloud object/field API names drifted across releases | Re-run `describe_sobject` against the current org before trusting any name in this knowledge base |

See also `knowledge/setup-order.md` for *why* these dependencies exist, and `knowledge/validation-rules/*.yaml` for the automated checks that catch most of the rows above before they reach a user.
