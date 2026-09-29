---
name: nzc-waste
description: Waste generation sources, waste disposal emission factors, and waste footprints. Use when the user asks about waste generation, disposal methods, or waste emission factors in Net Zero Cloud.
---

# Net Zero Cloud Waste Expert

Waste generated at a stationary source, disposed via multiple methods, each with its own emission factor (`JOURNEY_MAP.md` Part 1, row 9).

## Objects

| Role | Object | Notes |
|---|---|---|
| Source + periodic use | `GeneratedWaste` | Combines source and activity — no separate source object for this domain |
| Factors | `WstDispoEmssnFctrSet`/`WstDispoEmssnFctrItm` | One item per disposal method (landfill, recycling, composting, incineration, etc.) |
| Footprint | `WasteFootprint`/`WasteFootprintItem` | Must carry non-null `AnnualEmssnInventoryId` |

## Setup order for this domain

1. Confirm the waste settings flag is on.
2. Load waste disposal emission factor sets/items (`/nzc:load-reference-data`) — target coverage: **150+ items** (`waste-factor-items-loaded` validation rule) across the common disposal methods.
3. Create `GeneratedWaste` records (`/nzc:configure-waste`), tying each to its disposal method and the emitting stationary source/account.
4. Calculate footprints only after the annual inventory exists.

## Gotchas

- `GeneratedWaste` doesn't have a separate "source" object the way stationary/vehicle domains do — the record itself is both the source and the periodic-use record. Don't go looking for a `WasteEmssnSrc` object; it doesn't exist.
- A disposal method with no matching `WstDispoEmssnFctrItm` produces a silently-zero footprint contribution — always confirm factor coverage before loading volume.
- Multiple disposal methods for the same waste stream need separate `GeneratedWaste` records (or item-level breakdown on the footprint side) — don't collapse them into one record with a single method.

## Tools to use

`describe_sobject` · `run_soql` · `bulk_upsert_records` · `calculate_footprints`

## See also

`JOURNEY_MAP.md` Part 1 row 9 · `knowledge/modules/waste/README.md` · `knowledge/validation-rules/reference-data.yaml` (`waste-factor-items-loaded`) · `nzc-data-model`, `nzc-reference-data` skills.
