# Reference & Emission Factor Data

Published emission factors (electricity grid, fuel, refrigerant, waste disposal, procurement spend-based, travel) plus scope allocation and inflation-rate metadata that normalize factors across scopes and years. This is the one module where content must be **real and sourced, never fabricated** — see `CLAUDE.md` § "Never fabricate emission-factor values".

## Primary objects

`ElectricityEmssnFctrSet`, `OtherEmssnFctrSet`/`OtherEmssnFctrItem`, `RefrigerantEmssnFctr`, `WstDispoEmssnFctrSet`/`WstDispoEmssnFctrItm`, `PcmtEmssnFctrSet`/`PcmtEmssnFctrItem`, air/hotel/rental/ground travel factor sets, `CrbnEmssnScopeAlloc`/`CrbnEmssnScopeAllocVal`, `InflationRate`, `UnitOfMeasure` + conversions, `FuelType`.

## Sources

- Journey row 6 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched
- Committed seed: `data/reference/*` (`sf data import tree` plans, resolved via in-plan `referenceId`)

## Setup-sequence position

Steps 7-8 — after record types/`*Config` (5-6), before building intensity benchmarks (9) and before any source or periodic-use record (12-13) that would need to price against these factors.

## Related module

Every other module depends on this one. [`footprint-calc/`](../footprint-calc/README.md) is the final consumer of every factor loaded here.
