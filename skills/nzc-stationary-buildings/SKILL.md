---
name: nzc-stationary-buildings
description: Stationary asset sources (commercial buildings, data centers), periodic energy use, building size category and building energy intensity benchmarks, and stationary carbon footprints. Use when the user asks about buildings, data centers, stationary emission sources, or building energy intensity in Net Zero Cloud.
---

# Net Zero Cloud Stationary Assets / Buildings Expert

Buildings and data centers as emission sources — the first of the six domain clusters in the reference→source→use→footprint pipeline (`JOURNEY_MAP.md` Part 1, row 7).

## Objects

| Role | Object | Notes |
|---|---|---|
| Source | `StnryAssetEnvrSrc` | Record types: `Commercial_Building`, `Data_Center` (step 5) |
| `*Config` | `stationaryAssetEnvSourceConfigs` | Custom metadata, keyed by record type (step 6) |
| Periodic use | `StnryAssetEnrgyUse` | Must thread `StnryAssetEnvrSrcId` off an existing source |
| Benchmark | `BldgSizeCategory`, `BldgEnrgyIntensity`/`BldgEnrgyIntensityVal` | RTs: `Building_Energy_Intensity`, `Regional_Building_Energy_Intensity` — estimates consumption when metered data is incomplete |
| Footprint | `StnryAssetCrbnFtprnt`/`StnryAssetCrbnFtprntItm` | Must carry non-null `AnnualEmssnInventoryId` |

## Setup order for this domain

1. Confirm the stationary-assets settings flag is on (`nzc-foundation-licensing`).
2. Deploy `StnryAssetEnvrSrc` and `BldgEnrgyIntensity` record types + `stationaryAssetEnvSourceConfigs` (`/nzc:configure-record-types`).
3. Load electricity/other-fuel emission factors + building energy intensity benchmarks (`/nzc:load-reference-data`).
4. Create/link an owning `Account` for each source.
5. Create sources (`/nzc:configure-stationary-assets`), then periodic energy use.
6. Only after an `AnnualEmssnInventory` exists — calculate footprints (`/nzc:calculate-footprints`).

## Gotchas

- `stationary-sources-have-account` (validation rule) — a source with no `AccountId` is a data-integrity warning, not just cosmetic; footprint attribution needs it.
- Building energy intensity benchmarks only help when metered `StnryAssetEnrgyUse` data is sparse — don't skip loading real energy use just because a benchmark exists.
- Data centers and commercial buildings share the same source object but different record types — confirm the record type before writing any RT-specific SOQL filter.

## Tools to use

`describe_sobject` · `run_soql` · `deploy_metadata` (record types + `*Config`) · `bulk_upsert_records` (energy use volumes) · `calculate_footprints`

## See also

`JOURNEY_MAP.md` Part 1 row 7 / Part 2 steps 5,6,9 · `knowledge/modules/stationary-buildings/README.md` · `knowledge/validation-rules/foundation.yaml` (`stationary-source-record-types`, `bldg-intensity-record-types`) · `nzc-data-model`, `nzc-reference-data`, `nzc-carbon-footprint-calc` skills.
