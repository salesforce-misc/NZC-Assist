---
name: nzc-carbon-footprint-calc
description: Carbon footprint calculation across stationary, vehicle, waste, water, and Scope 3 sources, always linked to the annual emissions inventory. Use when the user asks about calculating footprints, the Data Processing Engine batch job, or why a footprint is missing or zero in Net Zero Cloud.
---

# Net Zero Cloud Carbon Footprint Calculation Expert

Footprint calculation rolls up periodic energy/activity use against matching emission factors into per-source footprints, linked to the annual inventory (`JOURNEY_MAP.md` Part 1, row 14). **This is always the last step** — see `CLAUDE.md` § "Footprint calculation is always last."

## Hard prerequisites (all must be true first)

1. Reference/factor data loaded for every source domain in scope.
2. Sources created (with record types + `*Config` metadata deployed).
3. Periodic energy/activity use loaded for those sources.
4. An `AnnualEmssnInventory` exists for the fiscal year in question.

If any of these is missing, footprint calculation either fails outright or — more dangerously — **succeeds with zero-value footprints that look superficially fine**. Always run `/nzc:audit` before trusting a footprint number.

## Footprint objects by domain

| Domain | Footprint object(s) |
|---|---|
| Stationary/buildings | `StnryAssetCrbnFtprnt`/`StnryAssetCrbnFtprntItm` |
| Vehicles/fleet | `VehicleAssetCrbnFtprnt` |
| Waste | `WasteFootprint`/`WasteFootprintItem` |
| Water | `StnryAssetWaterFtprnt`/`StnryAssetWaterFtprntItem` |
| Scope 3 (procurement + travel) | `Scope3CrbnFtprnt` |

**Every footprint record above must carry a non-null `AnnualEmssnInventoryId`.** This is the #1 data-integrity rule in this plugin (`knowledge/validation-rules/data-integrity.yaml`).

## How calculation actually runs

Footprint calculation is typically a **Data Processing Engine (DPE) batch job** (`BatchCalcJobDefinition`) or a **Setup UI action**, not a synchronous API call. This plugin's v1 approach:

1. Detect whether DPE is available (`DataProcessingEnginePsl` assigned, `BatchCalcJobDefinition` describable).
2. If yes — invoke the batch calculation via Apex (`run_apex`) and poll for completion.
3. If no / not reachable — load or generate **coherent footprint data directly** (matching what a correct calculation would produce, given the loaded factors and energy-use volumes) and clearly document that the DPE/UI path is the production-correct mechanism. This mirrors what `NZCwithSampleData` itself does via CCI flows.

Either way, **report which path was taken** — don't let the user assume a DPE job ran if it didn't.

## Common failure modes

| Symptom | Likely cause |
|---|---|
| Footprint calculates to zero | Reference/factor data wasn't fully loaded before energy-use data was loaded |
| Footprint missing entirely | `AnnualEmssnInventory` doesn't exist yet, or the source has no periodic-use records |
| `AnnualEmssnInventoryId = null` on a footprint | Footprint was created without linking it — see `footprints-linked-to-inventory` / `vehicle-footprints-linked-to-inventory` / `scope3-footprints-linked-to-inventory` validation rules |
| DPE job never completes | `DataProcessingEnginePsl` not assigned to the running user, or `BatchCalcJobDefinition` not configured for this org |

## Tools to use

`run_apex` (DPE invocation) · `run_soql` (verify linkage) · `describe_sobject` · `bulk_upsert_records` (coherent footprint data path) · `audit_nzc_config`

## See also

`JOURNEY_MAP.md` Part 1 row 14 / Part 2 step 14 · `knowledge/modules/footprint-calc/README.md` · `knowledge/validation-rules/data-integrity.yaml` · `nzc-annual-inventory`, `nzc-data-model` skills.
