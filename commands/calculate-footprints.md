---
description: Calculate or load carbon footprints for configured Net Zero Cloud sources
---

# Calculate Carbon Footprints

Produce carbon footprint records linked to an Annual Emissions Inventory, using whichever path is actually available in this org.

$ARGUMENTS

## Steps

1. Verify a target `AnnualEmssnInventory` exists for the period in question — footprints must link to one (`/nzc:build-annual-inventory` first if missing).
2. Verify enough periodic energy/activity-use data exists per domain to produce meaningful footprints.
3. Call `calculate_footprints`. It auto-detects the available path:
   - If a Data Processing Engine `BatchCalcJobDefinition` is available, it runs the calculation via Apex/DPE.
   - Otherwise, it loads coherent footprint data directly (mirroring what `NZCwithSampleData` does via CCI) and reports that the DPE/UI path was not available.
4. Report which path ran, and per-domain footprint counts (`StnryAssetCrbnFtprnt(+Itm)`, `VehicleAssetCrbnFtprnt`, `WasteFootprint(+Item)`, `StnryAssetWaterFtprnt(+Item)`, `Scope3CrbnFtprnt`).
5. Assert with `run_soql`: `footprints-linked-to-inventory` should be zero nulls — flag immediately if any footprint lacks an `AnnualEmssnInventoryId`.
6. If the DPE path wasn't available and the user wants the real batch calculation, give the manual Setup path rather than guessing at an API trigger.
