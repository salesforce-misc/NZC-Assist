---
name: nzc-vehicles-fleet
description: Fleet vehicle and private aircraft emission sources, periodic vehicle energy use, and vehicle carbon footprints. Use when the user asks about fleet vehicles, private jets, or vehicle/fleet emission sources in Net Zero Cloud.
---

# Net Zero Cloud Vehicles / Fleet Expert

Fleet vehicles and private aircraft as mobile emission sources (`JOURNEY_MAP.md` Part 1, row 8).

## Objects

| Role | Object | Notes |
|---|---|---|
| Source | `VehicleAssetEmssnSrc` | Record types: `Fleet_Vehicle`, `Private_Jet` (step 5) |
| `*Config` | `vehicleAssetEmssnSourceConfigs` | Custom metadata, keyed by record type (step 6) |
| Periodic use | `VehicleAssetEnrgyUse` | Must thread off an existing source |
| Footprint | `VehicleAssetCrbnFtprnt` | Must carry non-null `AnnualEmssnInventoryId` |

## Setup order for this domain

1. Confirm the vehicle-assets settings flag is on.
2. Deploy `VehicleAssetEmssnSrc` record types + `vehicleAssetEmssnSourceConfigs`.
3. Load fuel-type + other-emission-factor reference data (`FuelType`, `OtherEmssnFctrSet`/`Item`, `RefrigerantEmssnFctr`).
4. Create sources (`/nzc:configure-vehicles`) — Fleet vehicles typically owned by an `Account`; private jets may be tracked separately.
5. Load periodic energy/fuel use.
6. Calculate footprints only after the annual inventory exists.

## Gotchas

- Fleet vehicles and private jets share one source object — always confirm `RecordType.DeveloperName` before writing RT-specific logic; don't assume "vehicle" means "car."
- Fuel type classification must be correct before a factor set can be matched — a vehicle recorded with the wrong `FuelType` will silently compute against the wrong factor.
- `vehicle-source-record-types` (validation rule, `severity: warning`) checks both record types exist — don't treat a missing `Private_Jet` RT as blocking if this customer has no aircraft in scope.

## Tools to use

`describe_sobject` · `run_soql` · `deploy_metadata` · `bulk_upsert_records` · `calculate_footprints`

## See also

`JOURNEY_MAP.md` Part 1 row 8 / Part 2 steps 5,6 · `knowledge/modules/vehicles-fleet/README.md` · `knowledge/validation-rules/foundation.yaml` (`vehicle-source-record-types`) · `nzc-data-model`, `nzc-reference-data` skills.
