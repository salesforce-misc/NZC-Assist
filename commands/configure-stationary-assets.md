---
description: Set up stationary/buildings emission sources in Net Zero Cloud
---

# Configure Stationary Assets & Buildings

Wizard for setting up the stationary/buildings emissions domain (`StnryAssetEnvrSrc`, `BldgEnrgyIntensity`).

$ARGUMENTS

## Steps

1. Verify prerequisites: license, `Commercial_Building`/`Data_Center` record types on `StnryAssetEnvrSrc`, `Building_Energy_Intensity`/`Regional_Building_Energy_Intensity` on `BldgEnrgyIntensity`, and electricity/other-fuel reference factors loaded. If missing, route to `/nzc:configure-record-types` and `/nzc:load-reference-data` first.
2. Ask which accounts/facilities these sources belong to, or use existing seeded accounts (`data/seed/accounts.json`).
3. Use `describe_sobject StnryAssetEnvrSrc` to confirm current field names before building records.
4. Create/upsert `StnryAssetEnvrSrc` records (one per facility, with an owning Account and record type) via `create_record`/`bulk_upsert_records`.
5. For each source, create `StnryAssetEnrgyUse` periodic-use records referencing the matching electricity/fuel factor set — confirm factor set links resolve (no null factor lookups).
6. Assert with `run_soql`: `SELECT COUNT() FROM StnryAssetEnvrSrc` and the `stationary-sources-have-account` validation rule.
7. Report created record counts and IDs. Suggest `/nzc:calculate-footprints` once enough periods exist, or `/nzc:audit stationary`.
