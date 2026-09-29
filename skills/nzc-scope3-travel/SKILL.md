---
name: nzc-scope3-travel
description: Scope 3 business travel emission sources — air travel, hotel stays, rental cars, and ground travel energy use. Use when the user asks about business travel emissions, air travel, hotel stays, or rental car usage in Net Zero Cloud.
---

# Net Zero Cloud Scope 3 Business Travel Expert

Employee business travel emissions across four travel modes, each with its own periodic-use object and factor set (`JOURNEY_MAP.md` Part 1, row 12).

## Objects

| Role | Object | Notes |
|---|---|---|
| Source | `Scope3EmssnSrc` | Record-typed for travel |
| Periodic use — air | `AirTravelEnrgyUse` | |
| Periodic use — hotel | `HotelStayEnrgyUse` | |
| Periodic use — rental car | `RentalCarEnrgyUse` | |
| Periodic use — ground *(optional)* | `GroundTravelEnrgyUse` | Not every org tracks this mode |
| Footprint | `Scope3CrbnFtprnt` | Shared with procurement; must carry non-null `AnnualEmssnInventoryId` |

## Setup order for this domain

1. Confirm the Scope 3 settings flag is on.
2. Load the matching travel-factor sets (one per mode) via `/nzc:load-reference-data`.
3. Create travel `Scope3EmssnSrc` records (`/nzc:configure-scope3-travel`) — typically one per business unit or travel program, record-typed for travel.
4. Load per-mode periodic-use records — these are the highest-volume tier in the sample-data build (air travel and hotel stays especially; see `nzc-sample-data`).
5. Calculate footprints only after the annual inventory exists.

## Gotchas

- Four separate periodic-use objects, one shared footprint object — don't expect a 1:1 object-to-footprint mapping the way stationary/vehicle domains have.
- `GroundTravelEnrgyUse` is optional — don't treat its absence as a data-integrity failure unless the customer has explicitly scoped ground travel.
- This domain produces the largest transactional row counts in the sample-data build (air/hotel/rental commonly run into the hundreds of rows) — always use `bulk_upsert_records` (Bulk API 2.0), never one-at-a-time creates, and chunk CSVs appropriately.

## Tools to use

`describe_sobject` · `run_soql` · `bulk_upsert_records` · `calculate_footprints`

## See also

`JOURNEY_MAP.md` Part 1 row 12 · `knowledge/modules/scope3-travel/README.md` · `nzc-data-model`, `nzc-reference-data`, `nzc-scope3-procurement` skills.
