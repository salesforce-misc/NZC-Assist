# Water

Water withdrawal/discharge activity tied to a stationary source, rolled into a water footprint.

## Primary objects

`StnryAssetWaterActvty`, `StnryAssetWaterFtprnt`/`StnryAssetWaterFtprntItem`.

## Sources

- Journey row 10 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Depends on a stationary source already existing (step 12). Water activity loads at step 13; the water footprint (linked to the annual inventory) at step 14.

## Related module

[`stationary-buildings/`](../stationary-buildings/README.md) — the parent source every water activity record threads off of.
