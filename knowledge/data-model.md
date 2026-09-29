# Net Zero Cloud — Data Model

> Companion to `JOURNEY_MAP.md`. The journey map answers *"what order do we set things up in and why"*; this doc answers *"how does the data actually connect"*.

Every emissions domain in Net Zero Cloud — stationary, vehicle, waste, water, Scope 3 procurement, Scope 3 travel — follows the **same four-stage pipeline**:

```
reference / factor data  →  source  →  periodic energy or activity use  →  carbon footprint
                                                                                    │
                                                                                    ▼
                                                                      Annual Emissions Inventory
                                                                        (one per fiscal year;
                                                                         every footprint links here)
```

1. **Reference / factor data** — published emission factors (electricity, fuel, refrigerant, waste disposal, procurement spend-based, travel), scope allocation, inflation rates, UOM conversions, fuel types. Loaded once, rarely changes. Committed as seed data, never fabricated.
2. **Source** — the thing that emits: a building or data center (`StnryAssetEnvrSrc`), a fleet vehicle or private jet (`VehicleAssetEmssnSrc`), or a Scope 3 source (`Scope3EmssnSrc`, shared by procurement and travel). Split by record type per domain.
3. **Periodic energy or activity use** — the actual metered/estimated quantity for a period: electricity/fuel consumed, waste generated, water withdrawn/discharged, procurement spend, travel nights/miles. Always references its parent source.
4. **Carbon footprint** — the rolled-up result: quantity × matching factor, scope-allocated, for a period. Always references both its source and an `AnnualEmssnInventory`.

## Per-domain object map

| Domain | Source | Periodic use | Footprint | Key factor object(s) |
|---|---|---|---|---|
| Stationary (buildings, data centers) | `StnryAssetEnvrSrc` | `StnryAssetEnrgyUse` | `StnryAssetCrbnFtprnt`/`StnryAssetCrbnFtprntItm` | `ElectricityEmssnFctrSet`, `OtherEmssnFctrSet`/`Item`, `BldgEnrgyIntensity`/`Val` |
| Vehicles / fleet | `VehicleAssetEmssnSrc` | `VehicleAssetEnrgyUse` | `VehicleAssetCrbnFtprnt` | `OtherEmssnFctrSet`/`Item` (fuel), `FuelType` |
| Waste | `StnryAssetEnvrSrc` (parent) | `GeneratedWaste` | `WasteFootprint`/`WasteFootprintItem` | `WstDispoEmssnFctrSet`/`WstDispoEmssnFctrItm` |
| Water | `StnryAssetEnvrSrc` (parent) | `StnryAssetWaterActvty` | `StnryAssetWaterFtprnt`/`StnryAssetWaterFtprntItem` | (withdrawal/discharge factors — confirm via `describe_sobject`) |
| Scope 3 — procurement | `Scope3EmssnSrc` | `Scope3PcmtItem` | `Scope3CrbnFtprnt` | `PcmtEmssnFctrSet`/`PcmtEmssnFctrItem`, `InflationRate` |
| Scope 3 — travel | `Scope3EmssnSrc` | `AirTravelEnrgyUse`, `HotelStayEnrgyUse`, `RentalCarEnrgyUse`, `GroundTravelEnrgyUse` | `Scope3CrbnFtprnt` | per-mode travel factor sets |

Supporting/normalizing objects that cut across every domain: `CrbnEmssnScopeAlloc`/`CrbnEmssnScopeAllocVal` (Scope 1/2/3 allocation), `InflationRate` (year-over-year spend normalization), `UnitOfMeasure` + conversions, `BldgSizeCategory` (stationary only), `AnnualEmssnInventory` (the umbrella every footprint references), `Account` / `Supplier` (ownership and procurement counterparties).

## Key lookups to get right

- Every footprint object's `AnnualEmssnInventoryId` must be non-null and point to the current fiscal year's inventory — this is the single most common integrity failure. See `knowledge/validation-rules/data-integrity.yaml` → `footprints-linked-to-inventory`.
- Every periodic-use record must resolve to a source that already has its record type and `*Config` metadata deployed — a source without the right record type won't calculate correctly even if the use records exist.
- Scope 3 procurement and travel **share** the `Scope3EmssnSrc` and `Scope3CrbnFtprnt` objects — differentiate by record type / category field, not by object.

## API-name drift caveat

Every object and field name in this document reflects the plugin's design-time model. **Net Zero Cloud API names drift across Salesforce releases.** Never hand-write SOQL or a bulk-load CSV header row against a Net Zero object without calling `describe_sobject` against the *current* org first (see `CLAUDE.md` § "Always `describe_sobject`"). Treat every name above as "verify before use," not as a guarantee.

## See also

- `JOURNEY_MAP.md` — the ordered setup sequence this pipeline implies
- `knowledge/setup-order.md` — the same sequence, in prose
- `knowledge/modules/INDEX.md` — per-domain knowledge stubs
