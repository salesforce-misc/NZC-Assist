# Annual Emissions Inventory

The umbrella container for a fiscal year's emissions. Every footprint record across every domain must link back to one. Must exist before any footprint calculation runs.

## Primary objects

`AnnualEmssnInventory`.

## Sources

- Journey row 13 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Step 11 — after accounts/suppliers (step 10), before sources (step 12). Note this module's *setup-sequence step number (11) is earlier than its journey-row number (13)* — the inventory container must exist early because every footprint created much later (step 14) will reference it.

## Related module

[`footprint-calc/`](../footprint-calc/README.md) — every footprint object's mandatory `AnnualEmssnInventoryId` lookup targets a record from this module.
