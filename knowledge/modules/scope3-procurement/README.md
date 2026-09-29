# Scope 3 — Procurement

Purchased goods/services emissions via the spend-based method: a supplier plus procurement line items priced against category-level spend-based factors, inflation-normalized across years.

## Primary objects

`Scope3EmssnSrc`, `Scope3PcmtItem`, `PcmtEmssnFctrSet`/`PcmtEmssnFctrItem`, `Supplier`, `InflationRate`, `Scope3CrbnFtprnt`.

## Sources

- Journey row 11 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Suppliers load at step 10 (after reference data, before sources). Scope 3 procurement sources load at step 12; procurement line items at step 13; the Scope 3 footprint (linked to the annual inventory) at step 14.

## Related module

[`reference-data/`](../reference-data/README.md) — the procurement factor sets and inflation rates this domain prices against. [`scope3-travel/`](../scope3-travel/README.md) — the other half of Scope 3 in v1 scope.
