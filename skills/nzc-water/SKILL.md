---
name: nzc-water
description: Stationary asset water withdrawal/discharge activity and water footprints. Use when the user asks about water usage, water activity, or water footprints in Net Zero Cloud.
---

# Net Zero Cloud Water Expert

Water withdrawal/discharge activity tied to a stationary source, rolled into a water footprint (`JOURNEY_MAP.md` Part 1, row 10).

## Objects

| Role | Object | Notes |
|---|---|---|
| Periodic use | `StnryAssetWaterActvty` | Tied to an existing `StnryAssetEnvrSrc` |
| Footprint | `StnryAssetWaterFtprnt`/`StnryAssetWaterFtprntItem` | Must carry non-null `AnnualEmssnInventoryId` |

## Setup order for this domain

1. Confirm the water settings flag is on.
2. Confirm the parent stationary source(s) already exist — water activity has **no source object of its own**; it threads directly off `StnryAssetEnvrSrc` (`/nzc:configure-water` will refuse otherwise).
3. Load water activity records (withdrawal and/or discharge volumes, by period).
4. Calculate footprints only after the annual inventory exists.

## Gotchas

- Water is the one domain in this plugin with no dedicated source object — it's entirely dependent on stationary sources existing first. If a customer wants water tracking without buildings/data centers in scope, that's a modeling conflict worth flagging early.
- Withdrawal and discharge are typically tracked as separate activity records, not a single net figure — confirm which the customer's factor model expects before generating sample volumes.

## Tools to use

`describe_sobject` · `run_soql` · `bulk_upsert_records` · `calculate_footprints`

## See also

`JOURNEY_MAP.md` Part 1 row 10 · `knowledge/modules/water/README.md` · `nzc-stationary-buildings`, `nzc-data-model` skills.
