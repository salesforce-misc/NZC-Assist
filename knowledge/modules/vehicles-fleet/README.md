# Vehicles & Fleet

Fleet vehicles and private aircraft modeled as mobile emission sources, tracked via periodic fuel/energy use and rolled into a vehicle carbon footprint.

## Primary objects

`VehicleAssetEmssnSrc` (record types `Fleet_Vehicle`, `Private_Jet`), `VehicleAssetEnrgyUse`, `VehicleAssetCrbnFtprnt`, `FuelType`.

## Sources

- Journey row 8 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Sources load at step 12 (after record types at step 5 and reference/fuel-type data at step 7-8); periodic energy use at step 13; footprints (linked to the annual inventory) at step 14.

## Related module

[`reference-data/`](../reference-data/README.md) — fuel type + factor sets this domain prices against. [`footprint-calc/`](../footprint-calc/README.md) — the final rollup.
