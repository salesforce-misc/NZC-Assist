# Stationary Assets & Buildings

Buildings and data centers modeled as stationary emission sources, with periodic energy use rolling into a stationary carbon footprint. Building size category + building energy intensity benchmarks let footprint calculation estimate consumption when metered data is incomplete.

## Primary objects

`StnryAssetEnvrSrc` (record types `Commercial_Building`, `Data_Center`), `StnryAssetEnrgyUse`, `BldgSizeCategory`, `BldgEnrgyIntensity`/`BldgEnrgyIntensityVal`, `StnryAssetCrbnFtprnt`/`StnryAssetCrbnFtprntItm`.

## Sources

- Journey row 7 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Building intensity benchmarks load at step 9 (after record types, step 5). Sources load at step 12; periodic energy use at step 13; footprints (linked to the annual inventory) at step 14.

## Related module

[`waste/`](../waste/README.md) and [`water/`](../water/README.md) — both waste generation and water activity are tied to a stationary source. [`footprint-calc/`](../footprint-calc/README.md) — the final rollup.
