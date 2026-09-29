---
description: Set up vehicle and fleet emission sources in Net Zero Cloud
---

# Configure Vehicles & Fleet

Wizard for setting up the vehicles/fleet emissions domain (`VehicleAssetEmssnSrc`).

$ARGUMENTS

## Steps

1. Verify prerequisites: license, `Fleet_Vehicle`/`Private_Jet` record types on `VehicleAssetEmssnSrc`, and fuel-type/other-emission reference factors loaded. Route to `/nzc:configure-record-types` / `/nzc:load-reference-data` if missing.
2. Ask which record type applies (`Fleet_Vehicle` for ground fleet, `Private_Jet` for aviation) — both share the same source object, so get this right before creating records.
3. Use `describe_sobject VehicleAssetEmssnSrc` to confirm current field names and fuel-type picklist values.
4. Create/upsert `VehicleAssetEmssnSrc` records with the correct record type, owning Account, and fuel-type classification.
5. Create `VehicleAssetEnrgyUse` periodic-use records per source, referencing the matching fuel/other-emission factor set.
6. Assert with `run_soql` and check the `vehicle-source-record-types` validation rule (warning severity — some orgs legitimately use only one record type).
7. Report created record counts and IDs. Suggest `/nzc:calculate-footprints` or `/nzc:audit vehicles`.
