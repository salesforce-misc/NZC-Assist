---
description: Set up water usage emission tracking in Net Zero Cloud
---

# Configure Water

Wizard for setting up the water emissions domain (`StnryAssetWaterActvty`, threaded off existing stationary sources — there is no dedicated water source object).

$ARGUMENTS

## Steps

1. Verify prerequisites: license and at least one `StnryAssetEnvrSrc` already configured (`/nzc:configure-stationary-assets` first) — water activity threads off stationary sources rather than having its own source object.
2. Use `describe_sobject StnryAssetWaterActvty` to confirm current field names and the lookup back to `StnryAssetEnvrSrc`.
3. Ask which existing stationary sources should get water activity records, and over what periods.
4. Create/upsert `StnryAssetWaterActvty` records linked to the parent `StnryAssetEnvrSrc` IDs (query them first — don't guess IDs).
5. Assert with `run_soql`: `SELECT COUNT() FROM StnryAssetWaterActvty` grouped by parent source.
6. Report created record counts and IDs. Suggest `/nzc:calculate-footprints` or `/nzc:audit water`.
