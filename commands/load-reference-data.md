---
description: Load committed Net Zero Cloud reference and emission-factor data
---

# Load Net Zero Cloud Reference Data

Load the committed reference/emission-factor seed data in strict dependency order.

$ARGUMENTS

## Steps

1. Confirm org connection, license, and that settings/record types are already in place (`/nzc:enable-net-zero`, `/nzc:configure-record-types`) — reference data assumes those exist.
2. Call `load_reference_data`, which tree-loads `data/reference/*` following `data/reference/reference-load-order.json`:
   - UOM/conversions, `FuelType`
   - `ElectricityEmssnFctrSet`, `OtherEmssnFctrSet(+Item)`, `RefrigerantEmssnFctr`
   - `WstDispoEmssnFctrSet(+Itm)`
   - `PcmtEmssnFctrSet(+Item)`, `InflationRate`
   - Air/ground/hotel/rental/freight travel factors
   - `CrbnEmssnScopeAlloc(+Val)`
   - `BldgSizeCategory`, `BldgEnrgyIntensity(+Val)`
3. After each group loads, assert record counts with `run_soql` (`SELECT COUNT() FROM ...`) — never assume a tree import succeeded silently.
4. Report a per-object load summary (attempted/loaded/failed counts).
5. If any group fails, stop and report before attempting dependent groups — reference data has internal load-order dependencies too.
6. Suggest next step: `/nzc:scaffold-sample-data` or the relevant domain `configure-*` command.
