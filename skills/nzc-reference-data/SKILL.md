---
name: nzc-reference-data
description: Emission factor sets/items, scope allocation, inflation rates, UOM conversions, and fuel types — the published reference data every Net Zero Cloud footprint depends on. Use when the user asks about emission factors, factor sets, scope allocation, inflation rates, or loading Net Zero Cloud reference data.
---

# Net Zero Cloud Reference Data Expert

Published emission factors must exist before any source can compute a footprint (`JOURNEY_MAP.md` Part 2, steps 7-8). This is committed **seed data** — see `CLAUDE.md` § "Never fabricate emission-factor values."

## What's in scope

| Category | Objects | Feeds |
|---|---|---|
| Units & fuel | `UnitOfMeasure` (conversions), `FuelType` | Every domain's periodic-use quantity |
| Electricity | `ElectricityEmssnFctrSet` | Stationary/buildings |
| Other stationary/fuel | `OtherEmssnFctrSet`/`OtherEmssnFctrItem`, `RefrigerantEmssnFctr` | Stationary/buildings, vehicles |
| Waste | `WstDispoEmssnFctrSet`/`WstDispoEmssnFctrItm` | Waste |
| Procurement | `PcmtEmssnFctrSet`/`PcmtEmssnFctrItem` | Scope 3 procurement |
| Travel | Air/hotel/rental/ground travel factor sets | Scope 3 business travel |
| Normalization | `CrbnEmssnScopeAlloc`/`CrbnEmssnScopeAllocVal`, `InflationRate` | All Scope 1/2/3 rollups; procurement spend-year normalization |

## Load mechanics

- Format: `sf data import tree` JSON plans, relationships resolved via in-plan `referenceId` — no custom external-id fields needed (see `data/reference/reference-load-order.json` for the authoritative order).
- Load via `load_reference_data` (`nzc-sample-data`'s orchestration also calls this first).
- **Load order matters**: UOM/`FuelType` before factor sets/items; factor sets before items; everything before any source/energy-use data that references it.

## Verifying a load actually completed

Don't trust "the command didn't error" — assert counts:

```soql
SELECT COUNT() FROM ElectricityEmssnFctrSet         -- expect > 0
SELECT COUNT() FROM PcmtEmssnFctrItem                -- expect >= 300 (category-level coverage)
SELECT COUNT() FROM WstDispoEmssnFctrItm             -- expect >= 150
SELECT COUNT() FROM CrbnEmssnScopeAlloc              -- expect > 0
SELECT COUNT() FROM InflationRate                    -- expect > 0
SELECT COUNT() FROM BldgEnrgyIntensityVal            -- expect > 0
```

These are exactly `knowledge/validation-rules/reference-data.yaml` — run `/nzc:audit reference-data` instead of hand-rolling the counts.

## Common failure modes

| Symptom | Likely cause |
|---|---|
| Footprint calculates to zero despite energy-use data existing | Reference data load didn't complete before energy-use data was loaded — factor set never matched |
| Procurement footprint looks wrong across fiscal years | `InflationRate` missing for one or more years — spend never got normalized |
| Tree import fails partway | `reference-load-order.json` order violated, or a `referenceId` typo — re-run from the failing file, not the whole tree |

## Tools to use

- `import_tree` — tree-load `data/reference/*`
- `run_soql` — count assertions
- `describe_sobject` — confirm factor-set/item field names before writing a load plan against a new org

## See also

`JOURNEY_MAP.md` Part 2 steps 7-8 · `knowledge/modules/reference-data/README.md` · `knowledge/validation-rules/reference-data.yaml` · `nzc-data-model` skill.
