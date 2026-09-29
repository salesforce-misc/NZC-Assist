# Carbon Footprint Calculation

Rolls up periodic energy/activity use against the matching emission factors into per-source footprints, linked to the annual inventory. Typically a Data Processing Engine batch job or a Setup UI action rather than a synchronous API call — v1 loads/derives coherent footprint data and documents the DPE/UI path rather than triggering real DPE execution.

## Primary objects

`StnryAssetCrbnFtprnt`/`StnryAssetCrbnFtprntItm`, `VehicleAssetCrbnFtprnt`, `WasteFootprint`/`WasteFootprintItem`, `StnryAssetWaterFtprnt`/`StnryAssetWaterFtprntItem`, `Scope3CrbnFtprnt`, DPE `BatchCalcJobDefinition`.

## Sources

- Journey row 14 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Step 14 — always last among the v1-scoped steps. Requires every prior module: reference data (7-8), building intensity (9), accounts/suppliers (10), the annual inventory (11), sources (12), and periodic use (13) to already exist. Every footprint record must carry a non-null `AnnualEmssnInventoryId`.

## Related module

Depends on all other modules. [`annual-inventory/`](../annual-inventory/README.md) is the specific lookup target every footprint here must set.
