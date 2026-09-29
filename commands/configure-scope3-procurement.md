---
description: Set up Scope 3 procurement emission tracking in Net Zero Cloud
---

# Configure Scope 3 Procurement

Wizard for setting up the Scope 3 purchased-goods-and-services domain (`Supplier` → `Scope3EmssnSrc` → `Scope3PcmtItem`).

$ARGUMENTS

## Steps

1. Verify prerequisites: license, `PcmtEmssnFctrSet(+Item)` procurement factor sets loaded (needs a healthy floor of items — see `procurement-factor-items-loaded`, ≥300 in the reference reference profile), and `InflationRate` records present. Route to `/nzc:load-reference-data` if missing.
2. Ask for supplier list, or use seeded suppliers (`data/seed/suppliers.json`, ~21).
3. Use `describe_sobject Scope3EmssnSrc` and `describe_sobject Scope3PcmtItem` to confirm current field names.
4. Create/upsert `Scope3EmssnSrc` records linked to a `Supplier` — every procurement source needs a supplier owner (`scope3-procurement-sources-have-supplier` rule).
5. Create `Scope3PcmtItem` records per source, referencing the matching `PcmtEmssnFctrSet` item and spend amount — note inflation-rate sensitivity: item-year must align with an `InflationRate` record or amounts normalize incorrectly.
6. Assert with `run_soql`: item counts per source, and confirm no null factor-set links.
7. Report created record counts and IDs. Suggest `/nzc:calculate-footprints` or `/nzc:audit scope3`.
