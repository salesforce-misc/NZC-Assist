# Record Types & `*Config` Metadata

Source objects are split by record type per domain; `*Config` custom metadata types drive downstream footprint-calculation behavior (e.g. which building-intensity benchmark applies to a given stationary source). Both are deployed as metadata — never created via SOQL/DML.

## Primary objects / metadata

Record types on `StnryAssetEnvrSrc` (`Commercial_Building`, `Data_Center`), `VehicleAssetEmssnSrc` (`Fleet_Vehicle`, `Private_Jet`), `BldgEnrgyIntensity` (`Building_Energy_Intensity`, `Regional_Building_Energy_Intensity`). Custom metadata types: `stationaryAssetEnvSourceConfigs`, `vehicleAssetEmssnSourceConfigs`, `buildingEnergyIntensityConfigs`.

## Sources

- Journey row 5 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Steps 5-6 — after settings (step 4), before reference/factor data (step 7-8). Confirm every record-type/metadata API name via `describe_sobject` / `sf org list metadata` before deploying — these drift across releases.

## Related module

[`settings/`](../settings/README.md) — the enable flag each record type's domain depends on. [`stationary-buildings/`](../stationary-buildings/README.md) and [`vehicles-fleet/`](../vehicles-fleet/README.md) — the source objects these record types apply to.
