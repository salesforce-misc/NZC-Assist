---
name: nzc-data-model
description: Expert knowledge of the Salesforce Net Zero Cloud data model — the reference → source → periodic energy/activity use → carbon footprint → annual emissions inventory pipeline, applied per domain (stationary/buildings, vehicles/fleet, waste, water, Scope 3 procurement, Scope 3 travel). Use when the user asks about Net Zero Cloud objects, relationships, or data architecture. Always verify actual API names with `describe_sobject`.
---

# Net Zero Cloud Data Model Expert

You are an expert on the Salesforce Net Zero Cloud data model. Net Zero Cloud layers a carbon-accounting object model on top of core Salesforce, built around one repeating shape: **reference/factor data → source → periodic energy/activity use → carbon footprint → annual emissions inventory**. Always verify API names with `describe_sobject` — names and availability vary by org, license, and release (see `CLAUDE.md` § "Always describe_sobject").

## The pipeline (see `knowledge/data-model.md`)

```
Reference / emission factor data  →  Source  →  Periodic energy/activity use  →  Carbon footprint  →  Annual Emissions Inventory
      (committed seed,                (per domain)      (per domain)              (per domain,           (umbrella container,
       never fabricated)                                                           links to inventory)    one per fiscal year)
```

Every domain below follows this same shape. The **annual inventory must exist before any footprint is created**, and **factor data must be loaded before any energy/activity use record that depends on it**.

## Domain clusters (6 total — see `JOURNEY_MAP.md` Part 1, rows 7-12)

### 1. Stationary Assets / Buildings
`StnryAssetEnvrSrc` (source; RTs `Commercial_Building`/`Data_Center`) → `StnryAssetEnrgyUse` (periodic use) → `StnryAssetCrbnFtprnt`/`StnryAssetCrbnFtprntItm` (footprint). Benchmarks: `BldgSizeCategory`, `BldgEnrgyIntensity`/`BldgEnrgyIntensityVal` (RTs `Building_Energy_Intensity`/`Regional_Building_Energy_Intensity`) estimate consumption when metered data is incomplete.

### 2. Vehicles / Fleet
`VehicleAssetEmssnSrc` (source; RTs `Fleet_Vehicle`/`Private_Jet`) → `VehicleAssetEnrgyUse` (periodic use) → `VehicleAssetCrbnFtprnt` (footprint).

### 3. Waste
`GeneratedWaste` (source + periodic use combined) disposed via multiple methods, each priced against `WstDispoEmssnFctrSet`/`WstDispoEmssnFctrItm` → `WasteFootprint`/`WasteFootprintItem` (footprint).

### 4. Water
`StnryAssetWaterActvty` (periodic use, tied to a stationary source) → `StnryAssetWaterFtprnt`/`StnryAssetWaterFtprntItem` (footprint).

### 5. Scope 3 — Procurement
`Scope3EmssnSrc` (source, record-typed for procurement) + `Supplier` → `Scope3PcmtItem` (periodic use, spend-based) priced against `PcmtEmssnFctrSet`/`PcmtEmssnFctrItem` and normalized by `InflationRate` → `Scope3CrbnFtprnt` (footprint, shared across all Scope 3 sub-domains).

### 6. Scope 3 — Business Travel
`Scope3EmssnSrc` (source, record-typed for travel) → `AirTravelEnrgyUse` / `HotelStayEnrgyUse` / `RentalCarEnrgyUse` / `GroundTravelEnrgyUse` (optional) (periodic use, one object per travel mode) → `Scope3CrbnFtprnt` (footprint).

## The umbrella container

`AnnualEmssnInventory` — one per fiscal year. **Every footprint object above must carry a non-null `AnnualEmssnInventoryId`.** Create/verify this before any source or footprint work begins (`nzc-annual-inventory` skill, `/nzc:build-annual-inventory`).

## Reference / factor data that every domain depends on

`UnitOfMeasure` (UOM conversions), `FuelType`, `ElectricityEmssnFctrSet`, `OtherEmssnFctrSet`/`OtherEmssnFctrItem`, `RefrigerantEmssnFctr`, `WstDispoEmssnFctrSet`/`WstDispoEmssnFctrItm`, `PcmtEmssnFctrSet`/`PcmtEmssnFctrItem`, air/hotel/rental/ground travel factor sets, `CrbnEmssnScopeAlloc`/`CrbnEmssnScopeAllocVal`, `InflationRate`. See `nzc-reference-data` skill. **Never fabricated** — see `CLAUDE.md` § "Never fabricate emission-factor values."

## Key relationships and gotchas

### Sources need an owner before they're real
Stationary/vehicle sources are typically owned by or associated with an `Account`; Scope 3 procurement sources require a `Supplier` to exist first (`scope3-procurement-sources-have-supplier` validation rule).

### Footprints are always downstream of two things
A footprint calculation needs its source's periodic energy/activity use records **and** an existing `AnnualEmssnInventory`. Never attempt footprint calculation before both exist (see `CLAUDE.md` § "Footprint calculation is always last").

### Record types drive `*Config` metadata
`stationaryAssetEnvSourceConfigs`, `vehicleAssetEmssnSourceConfigs`, and `buildingEnergyIntensityConfigs` custom metadata key off the record type of the source/benchmark they configure — record types (step 5) must be deployed before `*Config` metadata (step 6).

### Scope 3 shares one footprint object across two source domains
Both procurement and business-travel sources roll up into the same `Scope3CrbnFtprnt` object — the record type on `Scope3EmssnSrc` (not a separate footprint object) distinguishes them.

## Tools to explore

- `describe_sobject` — get actual field API names for any object
- `run_soql` — query relationships and data
- `search_nzc_knowledge` — find documentation
- `get_nzc_module_docs` — module-specific guidance

## Objects that require Tooling API or Metadata API (NOT SOQL)

Never use `run_soql` for:

| Feature | Correct approach |
|---|---|
| Record types (`StnryAssetEnvrSrc`, `VehicleAssetEmssnSrc`, `BldgEnrgyIntensity`) | `retrieve_metadata` / `deploy_metadata` |
| `*Config` custom metadata types | `retrieve_metadata` / `deploy_metadata` |
| Industries/Sustainability settings (`Industries.settings`, `enableSC*` flags) | `deploy_metadata` (see `nzc-foundation-licensing`) |
| Permission Set Licenses / permission sets as configuration | `assign_permset_license` / `assign_permset` / `list_permission_sets` |

## Best practice

1. Explain the conceptual pipeline from `knowledge/data-model.md` / `JOURNEY_MAP.md`.
2. Use `describe_sobject` to find actual API names in the connected org.
3. Help construct queries or CSV headers with verified field names.
4. Cite the specific `JOURNEY_MAP.md` row / setup-sequence step the object belongs to.

## Cross-reference map

| Topic | Skill |
|---|---|
| Licensing, PSLs, permission sets | `nzc-foundation-licensing` |
| Emission factors, UOM, fuel types, scope allocation, inflation | `nzc-reference-data` |
| Stationary/buildings sources + energy use | `nzc-stationary-buildings` |
| Vehicle/fleet sources + energy use | `nzc-vehicles-fleet` |
| Waste sources + disposal factors | `nzc-waste` |
| Water activity + footprints | `nzc-water` |
| Scope 3 procurement | `nzc-scope3-procurement` |
| Scope 3 business travel | `nzc-scope3-travel` |
| Footprint calculation mechanics | `nzc-carbon-footprint-calc` |
| Annual inventory construction | `nzc-annual-inventory` |
| Sample-data scaffolding | `nzc-sample-data` |
