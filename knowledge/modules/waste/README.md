# Waste

Waste generated at a stationary source, disposed via multiple methods (landfill, recycling, composting, incineration), each priced against its own disposal-method emission factor, rolling into a waste footprint.

## Primary objects

`GeneratedWaste`, `WstDispoEmssnFctrSet`/`WstDispoEmssnFctrItm`, `WasteFootprint`/`WasteFootprintItem`.

## Sources

- Journey row 9 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Depends on a stationary source already existing (step 12) and waste disposal factor sets already loaded (step 8). Generated waste loads at step 13; the waste footprint (linked to the annual inventory) at step 14.

## Related module

[`stationary-buildings/`](../stationary-buildings/README.md) — the parent source every `GeneratedWaste` record threads off of.
