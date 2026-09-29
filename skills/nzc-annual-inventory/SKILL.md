---
name: nzc-annual-inventory
description: Annual Emissions Inventory construction — the umbrella container every Net Zero Cloud footprint must reference. Use when the user asks about the annual emissions inventory, fiscal-year reporting scope, or why a footprint has no inventory link.
---

# Net Zero Cloud Annual Emissions Inventory Expert

`AnnualEmssnInventory` is the umbrella container for a fiscal year's emissions — every footprint record in the org must link back to one (`JOURNEY_MAP.md` Part 1, row 13 / Part 2, step 11).

## What it owns

- One record per fiscal year in scope.
- The reporting-scope decision (which fiscal year, which domains count) — owned by the Sustainability Program Manager persona, executed by whoever builds it (see `PERSONA_JOURNEYS.md`).
- Every `StnryAssetCrbnFtprnt`, `VehicleAssetCrbnFtprnt`, `WasteFootprint`, `StnryAssetWaterFtprnt`, and `Scope3CrbnFtprnt` record's `AnnualEmssnInventoryId`.

## Setup order

`AnnualEmssnInventory` must exist **before** any source or footprint is created against it (step 11 comes right after accounts/suppliers, step 10, and right before sources, step 12). Creating sources or footprints first, then trying to backfill the inventory link, is backwards — always create the inventory first via `/nzc:build-annual-inventory`.

## Gotchas

- `annual-inventory-exists` (validation rule, `severity: error`) checks `COUNT() FROM AnnualEmssnInventory > 0` — this is one of the first checks any audit should run, since almost every downstream data-integrity rule assumes it passed.
- Multi-year reporting means multiple `AnnualEmssnInventory` records — don't assume a single "current" one; confirm which fiscal year a given footprint should link to before creating it.
- A footprint created with the wrong `AnnualEmssnInventoryId` (e.g., last year's inventory instead of this year's) passes the "non-null" check but is still wrong — non-null is necessary, not sufficient. When in doubt, confirm the fiscal year explicitly with the user.

## Tools to use

`run_soql` · `create_record` / `bulk_upsert_records` · `describe_sobject`

## See also

`JOURNEY_MAP.md` Part 1 row 13 / Part 2 step 11 · `knowledge/modules/annual-inventory/README.md` · `knowledge/validation-rules/data-integrity.yaml` (`annual-inventory-exists`) · `nzc-carbon-footprint-calc` skill.
