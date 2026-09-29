# Scope 3 — Business Travel

Employee business travel emissions: air travel, hotel stays, rental cars, and (optionally) ground travel, each with its own energy-use object and factor set.

## Primary objects

`Scope3EmssnSrc`, `AirTravelEnrgyUse`, `HotelStayEnrgyUse`, `RentalCarEnrgyUse`, `GroundTravelEnrgyUse` (optional), `Scope3CrbnFtprnt`.

## Sources

- Journey row 12 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Scope 3 travel sources load at step 12; per-mode travel energy use (air/hotel/rental/ground) at step 13; the Scope 3 footprint (linked to the annual inventory, shared with procurement) at step 14.

## Related module

[`scope3-procurement/`](../scope3-procurement/README.md) — shares the same `Scope3EmssnSrc` source object and `Scope3CrbnFtprnt` footprint object.
